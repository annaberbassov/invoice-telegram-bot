const { Telegraf, Markup } = require('telegraf');
const http = require('http');

console.log('🚀 A&A Backoffice Bot startet...');

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// HTTP Server mit Webhook Handler
const server = http.createServer((req, res) => {
  if (req.url === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        bot.handleUpdate(update);
        console.log('📨 Update:', update.message?.text || 'Button');
      } catch (e) {
        console.error('❌ Parse Error:', e);
      }
      
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('OK');
    });
  } else {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('A&A Backoffice Bot Running');
  }
});

server.listen(PORT, () => {
  console.log(`✅ HTTP Server läuft auf Port ${PORT}`);
});

// =============== MEMORY-OPTIMIERTE DATENSTRUKTUREN ===============
const invoices = new Map(); // Kurze IDs → Invoice Data
const reminders = new Map(); // Timer-Referenzen
let idCounter = 1000; // Kurze numerische IDs

// KRITISCH: Automatisches Memory-Cleanup alle 15 Minuten
setInterval(() => {
  // Invoices cleanup - max 50 behalten
  if (invoices.size > 50) {
    const entries = Array.from(invoices.entries());
    const toDelete = entries.slice(0, invoices.size - 50);
    toDelete.forEach(([key]) => invoices.delete(key));
    console.log(`🧹 Invoices cleanup: ${toDelete.length} gelöscht, ${invoices.size} aktiv`);
  }
  
  // Memory status loggen
  const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  console.log(`💾 Memory: ${memUsage}MB, Invoices: ${invoices.size}, Reminders: ${reminders.size}`);
  
  // NOTFALL: Memory über 400MB → aggressive Cleanup
  if (memUsage > 400) {
    console.log('⚠️ MEMORY WARNUNG - Aggressive Cleanup');
    invoices.clear();
    reminders.forEach(timerId => clearTimeout(timerId));
    reminders.clear();
    global.gc && global.gc(); // Garbage Collection wenn verfügbar
  }
}, 15 * 60 * 1000); // Alle 15 Minuten

// =============== APPS SCRIPT INTEGRATION ===============
bot.use(async (ctx, next) => {
  if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/invoice_data:')) {
    const data = ctx.message.text.replace('/invoice_data:', '');
    try {
      const invoice = JSON.parse(data);
      processNewInvoice(ctx, invoice);
      return;
    } catch (e) {
      console.log('❌ Apps Script Parse Fehler:', e);
    }
  }
  return next();
});

// =============== NEUE RECHNUNG VERARBEITEN ===============
function processNewInvoice(ctx, invoiceData) {
  const shortId = idCounter++;
  
  // Memory-optimiert: Nur wichtigste Daten speichern
  const invoice = {
    id: shortId,
    fileName: (invoiceData.name || invoiceData.fileName || 'unbekannt.pdf').substring(0, 80), // Begrenzen
    type: (invoiceData.keyword || invoiceData.type || 'rechnung').substring(0, 20),
    project: (invoiceData.project || 'unbekannt').substring(0, 30),
    date: invoiceData.date || new Date().toISOString().split('T')[0],
    driveUrl: invoiceData.url || invoiceData.driveUrl || '#',
    fileId: invoiceData.fileId || null,
    status: 'pending',
    created: Date.now() // Für Cleanup
  };
  
  invoices.set(shortId, invoice);
  sendInvoiceMessage(ctx, invoice);
  
  console.log(`✅ Invoice ${shortId}: ${invoice.fileName.substring(0, 30)}`);
}

// =============== TEST-KOMMANDOS ===============
bot.command('rechnung', (ctx) => {
  const testInvoice = {
    name: 'mahnung_TestProjekt_2025_09_12.pdf',
    keyword: 'mahnung', 
    project: 'TestProjekt',
    date: '2025_09_12',
    url: 'https://drive.google.com/file/d/test123/view',
    fileId: 'test123'
  };
  processNewInvoice(ctx, testInvoice);
});

// Apps Script Integration
bot.command('newInvoice', (ctx) => {
  const text = ctx.message.text;
  const matches = text.match(/"([^"]+)"/g);
  
  if (matches && matches.length >= 4) {
    const invoice = {
      name: matches[0].replace(/"/g, ''),
      keyword: matches[1].replace(/"/g, ''),
      project: matches[2].replace(/"/g, ''),
      date: matches[3].replace(/"/g, ''),
      url: matches[4] ? matches[4].replace(/"/g, '') : '#',
      fileId: matches[5] ? matches[5].replace(/"/g, '') : null
    };
    processNewInvoice(ctx, invoice);
  } else {
    ctx.reply('❌ Format: /newInvoice "datei" "typ" "projekt" "datum"');
  }
});

// =============== NACHRICHT MIT BUTTONS ===============
function sendInvoiceMessage(ctx, invoice) {
  const shortName = invoice.fileName.length > 35 ? 
                   invoice.fileName.substring(0, 32) + '...' : 
                   invoice.fileName;

  // Kurze Callback-Data für 64-Byte-Limit
const buttons = Markup.inlineKeyboard([
  [
    Markup.button.callback('✅ BEZAHLT', `p_${invoice.id}`),
    Markup.button.callback('⏰ ERINNERUNG', `r_${invoice.id}`)
  ],
  [
    Markup.button.callback('🔄 RÜCKGÄNGIG', `u_${invoice.id}`)
  ]
]);


  const message = 
    `📋 <b>Neue Rechnung</b>\n\n` +
    `📄 <b>Datei:</b> ${shortName}\n` +
    `💰 <b>Typ:</b> ${invoice.type}\n` +
    `🏢 <b>Projekt:</b> ${invoice.project}\n` +
    `📅 <b>Datum:</b> ${invoice.date}\n` +
    `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>\n\n` +
    `<b>Status:</b> Ausstehend ⏳`;

  ctx.reply(message, { 
    parse_mode: 'HTML',
    ...buttons,
    disable_web_page_preview: true 
  });
}

// =============== BEZAHLT BUTTON ===============
bot.action(/^p_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const invoice = invoices.get(id);
  
  if (!invoice) {
    await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
    return;
  }

  await ctx.answerCbQuery('✅ Als bezahlt markiert!');
  
  invoice.status = 'paid';
  invoice.paidDate = new Date().toISOString();

  // Apps Script benachrichtigen
  if (invoice.fileId) {
    notifyAppsScript('move_to_paid', invoice.fileId);
  }

  const shortName = invoice.fileName.length > 35 ? 
                   invoice.fileName.substring(0, 32) + '...' : 
                   invoice.fileName;

  const newButtons = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 RÜCKGÄNGIG MACHEN', `u_${invoice.id}`)]
  ]);

  await ctx.editMessageText(
    `✅ <b>BEZAHLT</b>\n\n` +
    `📄 <b>Datei:</b> ${shortName}\n` +
    `💰 <b>Typ:</b> ${invoice.type}\n` +
    `🏢 <b>Projekt:</b> ${invoice.project}\n` +
    `📅 <b>Bezahlt:</b> ${new Date().toLocaleDateString('de-DE')}\n` +
    `⏰ <b>Zeit:</b> ${new Date().toLocaleTimeString('de-DE')}\n\n` +
    `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>`,
    { 
      parse_mode: 'HTML',
      ...newButtons,
      disable_web_page_preview: true 
    }
  );

  // Erinnerungen löschen
  clearRemindersForInvoice(id);
});

// =============== RÜCKGÄNGIG BUTTON ===============
bot.action(/^u_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const invoice = invoices.get(id);
  
  if (!invoice) {
    await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
    return;
  }

  await ctx.answerCbQuery('🔄 Rückgängig gemacht!');
  
  invoice.status = 'pending';
  delete invoice.paidDate;

  // Apps Script - zurück zum Invoice-Ordner
  if (invoice.fileId) {
    notifyAppsScript('move_to_invoice', invoice.fileId);
  }

  // Original-Message wiederherstellen
  sendInvoiceMessage(ctx, invoice);
});


// =============== ERINNERUNG SYSTEM ===============

// ERINNERUNG Button - Tag wählen (Mo-Di-Mi-Do-Fr)
bot.action(/^r_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  
  const dayButtons = Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Montag', `d_${id}_1`),
      Markup.button.callback('📅 Dienstag', `d_${id}_2`)
    ],
    [
      Markup.button.callback('📅 Mittwoch', `d_${id}_3`),
      Markup.button.callback('📅 Donnerstag', `d_${id}_4`)
    ],
    [
      Markup.button.callback('📅 Freitag', `d_${id}_5`)
    ]
  ]);

  ctx.reply('⏰ <b>Erinnerung setzen</b>\n\n📅 Wähle den Tag:', {
    parse_mode: 'HTML',
    ...dayButtons
  });
});

// TAG gewählt - Uhrzeit wählen
bot.action(/^d_(.+)_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const day = parseInt(ctx.match[2]);
  
  const dayNames = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  
  await ctx.answerCbQuery();
  
  const timeButtons = Markup.inlineKeyboard([
    [
      Markup.button.callback('🕙 10:00', `dt_${id}_${day}_10`),
      Markup.button.callback('🕐 16:00', `dt_${id}_${day}_16`)
    ],
    [
      Markup.button.callback('🔙 Zurück zu Tagen', `r_${id}`)
    ]
  ]);

  ctx.editMessageText(
    `⏰ <b>Erinnerung setzen</b>\n\n📅 <b>Tag:</b> ${dayNames[day]}\n\n🕐 Wähle die Uhrzeit:`,
    { 
      parse_mode: 'HTML',
      ...timeButtons 
    }
  );
});

// TAG + ZEIT gewählt - Timer setzen
bot.action(/^dt_(.+)_(.+)_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const targetDay = parseInt(ctx.match[2]);
  const targetHour = parseInt(ctx.match[3]);
  const invoice = invoices.get(id);
  
  if (!invoice) {
    await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
    return;
  }
  
  await ctx.answerCbQuery('✅ Erinnerung gesetzt!');
  
  try {
    const reminderDate = getNextWeekday(targetDay, targetHour);
    const timeUntilReminder = reminderDate.getTime() - Date.now();
    
    // Memory-Schutz: Max 7 Tage Timer
    if (timeUntilReminder > 0 && timeUntilReminder < 7 * 24 * 60 * 60 * 1000) {
      const timerId = setTimeout(() => {
        sendReminderNotification(ctx.telegram, ctx.chat.id, invoice);
        reminders.delete(`${id}_reminder`);
      }, timeUntilReminder);
      
      // Alten Timer löschen falls vorhanden
      clearRemindersForInvoice(id);
      reminders.set(`${id}_reminder`, timerId);
      
      console.log(`⏰ Erinnerung ${id}: ${Math.round(timeUntilReminder/1000/60)} Min`);
    }
    
    const dayNames = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    const formattedDate = reminderDate.toLocaleDateString('de-DE');
    const formattedTime = reminderDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    
    ctx.editMessageText(
      `✅ <b>Erinnerung gesetzt</b>\n\n` +
      `📄 <b>Rechnung:</b> ${invoice.fileName.substring(0, 30)}...\n` +
      `📅 <b>Tag:</b> ${dayNames[targetDay]}\n` +
      `⏰ <b>Zeit:</b> ${targetHour}:00 Uhr\n` +
      `📆 <b>Datum:</b> ${formattedDate}\n\n` +
      `Du wirst am ${formattedDate} um ${formattedTime} erinnert! 🔔`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    console.error('Erinnerung Fehler:', error);
    ctx.reply('❌ Fehler beim Setzen der Erinnerung.');
  }
});

// =============== ERINNERUNGS-NACHRICHT ===============
function sendReminderNotification(telegram, chatId, invoice) {
  const shortName = invoice.fileName.length > 30 ? 
                   invoice.fileName.substring(0, 27) + '...' : 
                   invoice.fileName;

  const buttons = Markup.inlineKeyboard([
  [
    Markup.button.callback('✅ BEZAHLT', `p_${invoice.id}`)
  ],
  [
    Markup.button.callback('🕐 In 2h erinnern', `s_${invoice.id}_2`),
    Markup.button.callback('⏰ Neue Erinnerung', `r_${invoice.id}`)
  ]
]);


  telegram.sendMessage(chatId,
    `🔔 <b>ERINNERUNG</b>\n\n` +
    `⚠️ <b>Rechnung noch nicht bezahlt!</b>\n\n` +
    `📄 <b>Datei:</b> ${shortName}\n` +
    `💰 <b>Typ:</b> ${invoice.type}\n` +
    `🏢 <b>Projekt:</b> ${invoice.project}\n` +
    `📅 <b>Datum:</b> ${invoice.date}\n\n` +
    `🔗 <a href="${invoice.driveUrl}">Drive-Link öffnen</a>`,
    { 
      parse_mode: 'HTML',
      ...buttons,
      disable_web_page_preview: true 
    }
  );
  
  console.log(`🔔 Erinnerung gesendet: ${invoice.id}`);
}

// SNOOZE-Funktion (In 2 Stunden erinnern)
bot.action(/^s_(.+)_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const hours = parseInt(ctx.match[2]);
  const invoice = invoices.get(id);
  
  if (!invoice) {
    await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
    return;
  }
  
  await ctx.answerCbQuery(`⏰ In ${hours} Stunden erinnern!`);
  
  // Timer setzen
  const timerId = setTimeout(() => {
    sendReminderNotification(ctx.telegram, ctx.chat.id, invoice);
  }, hours * 60 * 60 * 1000);
  
  reminders.set(`${id}_snooze`, timerId);
  
  const snoozeTime = new Date(Date.now() + hours * 60 * 60 * 1000);
  const formattedTime = snoozeTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  ctx.editMessageText(
    `⏰ <b>Erinnerung verschoben</b>\n\n` +
    `📄 <b>Rechnung:</b> ${invoice.fileName.substring(0, 30)}...\n` +
    `🕐 <b>Nächste Erinnerung:</b> ${formattedTime}\n\n` +
    `Du wirst in ${hours} Stunden erneut erinnert! 🔔`,
    { parse_mode: 'HTML' }
  );
});

// =============== HELPER FUNKTIONEN ===============
function getNextWeekday(targetDay, hour) {
  const now = new Date();
  const target = new Date();
  
  const currentDay = now.getDay(); // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
  let daysUntilTarget = targetDay - currentDay;
  
  // Wenn Tag schon vorbei ODER heute aber Zeit vorbei → nächste Woche
  if (daysUntilTarget < 0 || 
      (daysUntilTarget === 0 && now.getHours() >= hour)) {
    daysUntilTarget += 7;
  }
  
  target.setDate(now.getDate() + daysUntilTarget);
  target.setHours(hour, 0, 0, 0);
  
  return target;
}

function clearRemindersForInvoice(invoiceId) {
  const keys = [`${invoiceId}_reminder`, `${invoiceId}_snooze`];
  keys.forEach(key => {
    const timerId = reminders.get(key);
    if (timerId) {
      clearTimeout(timerId);
      reminders.delete(key);
    }
  });
}

function notifyAppsScript(action, fileId) {
  console.log(`📤 Apps Script: ${action} für ${fileId}`);
  
  const APPS_SCRIPT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbyDONFHC6_mHc5WGA4pzcwjR6c3xLilmwj9z-TLNSeTy99Rg0xNapmy8AW1n7GEOCt0_w/exec';
  
  const payload = {
    action: action,
    fileId: fileId
  };

  try {
    // ECHTER Call zu Apps Script (auskommentieren aktiviert den Call)
    fetch(APPS_SCRIPT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log(`✅ Apps Script Call gesendet: ${JSON.stringify(payload)}`);
  } catch (e) {
    console.error('❌ Apps Script Error:', e);
  }
}



// =============== STANDARD-KOMMANDOS ===============
bot.start((ctx) => {
  ctx.reply(
    `🤖 <b>A&A Backoffice Bot gestartet!</b>\n\n` +
    `📋 <b>Funktionen:</b>\n` +
    `✅ Rechnungen verarbeiten\n` +
    `🔄 Bezahlt/Rückgängig\n` +
    `⏰ Erinnerungen (Mo-Fr, 10/16 Uhr)\n` +
    `📁 Drive-Integration\n\n` +
    `<b>Test:</b> /rechnung\n` +
    `<b>Status:</b> /status`,
    { parse_mode: 'HTML' }
  );
});

bot.command('status', (ctx) => {
  const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const activeInvoices = invoices.size;
  const activeReminders = reminders.size;
  
  ctx.reply(
    `📊 <b>Bot Status</b>\n\n` +
    `📄 <b>Aktive Rechnungen:</b> ${activeInvoices}\n` +
    `⏰ <b>Aktive Erinnerungen:</b> ${activeReminders}\n` +
    `💾 <b>Memory:</b> ${memUsage}MB / 512MB\n` +
    `🕐 <b>Uptime:</b> ${Math.round(process.uptime() / 60)} Min\n` +
    `🟢 <b>Status:</b> Online ✅`,
    { parse_mode: 'HTML' }
  );
});

// Memory-Status für Debugging
bot.command('memory', (ctx) => {
  const mem = process.memoryUsage();
  ctx.reply(
    `💾 <b>Memory Status</b>\n\n` +
    `<b>Heap:</b> ${Math.round(mem.heapUsed / 1024 / 1024)}MB\n` +
    `<b>Total:</b> ${Math.round(mem.heapTotal / 1024 / 1024)}MB\n` +
    `<b>External:</b> ${Math.round(mem.external / 1024 / 1024)}MB\n` +
    `<b>RSS:</b> ${Math.round(mem.rss / 1024 / 1024)}MB\n\n` +
    `<b>Invoices:</b> ${invoices.size}\n` +
    `<b>Reminders:</b> ${reminders.size}`,
    { parse_mode: 'HTML' }
  );
});

// =============== ERROR HANDLING & STARTUP ===============
bot.catch((err, ctx) => {
  console.error('Bot Fehler:', err);
});


// Webhook für Production setzen
if (process.env.NODE_ENV === 'production') {
  const webhookUrl = 'https://invoice-telegram-bot.onrender.com/webhook';
  bot.telegram.setWebhook(webhookUrl);
  console.log(`🔗 Webhook gesetzt: ${webhookUrl}`);
} else {
  bot.launch();
  console.log('🔄 Polling-Modus für Development');
}

console.log('✅ A&A BACKOFFICE BOT LÄUFT PERFEKT!');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));






