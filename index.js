const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const https = require('https');

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

// =============== BOT STATE MANAGEMENT ===============
const invoices = new Map();
const reminders = new Map();
let invoiceCounter = 1;

// =============== MEMORY MONITORING ===============
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024),
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024)
  };
}

// =============== APPS SCRIPT NOTIFICATION ===============
function notifyAppsScript(action, fileId) {
  console.log(`📤 Apps Script: ${action} für ${fileId}`);
  
  const APPS_SCRIPT_WEBHOOK = 'https://script.google.com/macros/s/DEINE_SCRIPT_ID/exec';
  
  const payload = JSON.stringify({
    action: action,
    fileId: fileId
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };

  try {
    const req = https.request(APPS_SCRIPT_WEBHOOK, options, (res) => {
      console.log(`✅ Apps Script Response: ${res.statusCode}`);
    });
    
    req.on('error', (e) => {
      console.error('❌ Apps Script Error:', e);
    });
    
    req.write(payload);
    req.end();
    
    console.log(`📤 Apps Script Call gesendet: ${payload}`);
  } catch (e) {
    console.error('❌ Apps Script Error:', e);
  }
}

// =============== HELPER FUNCTIONS ===============
function getNextWeekday(weekday, hour) {
  const today = new Date();
  const currentDay = today.getDay();
  const currentHour = today.getHours();
  
  let daysUntilTarget = weekday - currentDay;
  
  if (daysUntilTarget < 0 || (daysUntilTarget === 0 && currentHour >= hour)) {
    daysUntilTarget += 7;
  }
  
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  targetDate.setHours(hour, 0, 0, 0);
  
  return targetDate;
}

function clearRemindersForInvoice(invoiceId) {
  const reminderKey = `${invoiceId}_reminder`;
  if (reminders.has(reminderKey)) {
    clearTimeout(reminders.get(reminderKey));
    reminders.delete(reminderKey);
    console.log(`🗑️ Timer für Rechnung ${invoiceId} gelöscht`);
  }
}

// =============== INVOICE PROCESSING ===============
bot.hears(/^\/invoice_data:(.+)/, async (ctx) => {
  try {
    const jsonData = ctx.match[1];
    const invoiceData = JSON.parse(jsonData);
    
    const invoice = {
      id: invoiceCounter++,
      fileName: invoiceData.name,
      type: invoiceData.keyword,
      project: invoiceData.project,
      date: invoiceData.date,
      fileId: invoiceData.fileId,
      driveUrl: invoiceData.url,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    invoices.set(invoice.id, invoice);
    console.log(`📄 Neue Rechnung: ${invoice.fileName} (ID: ${invoice.id})`);
    
    await sendInvoiceMessage(ctx, invoice);
    
  } catch (error) {
    console.error('Invoice Data Error:', error);
    await ctx.reply('❌ Fehler beim Verarbeiten der Rechnungsdaten');
  }
});

async function sendInvoiceMessage(ctx, invoice) {
  const shortName = invoice.fileName.length > 35 ? 
                   invoice.fileName.substring(0, 32) + '...' : 
                   invoice.fileName;

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

  await ctx.reply(message, { 
    parse_mode: 'HTML', 
    ...buttons,
    disable_web_page_preview: true 
  });
}

// =============== BUTTON HANDLERS ===============

// BEZAHLT Button
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

  // EDITIERE die bestehende Nachricht (keine neue!)
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
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 RÜCKGÄNGIG MACHEN', `u_${invoice.id}`)]
      ]),
      disable_web_page_preview: true 
    }
  );

  // Erinnerungen löschen
  clearRemindersForInvoice(id);
});

// RÜCKGÄNGIG Button
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

  // Erinnerungen auch löschen bei Rückgängig
  clearRemindersForInvoice(id);

  const shortName = invoice.fileName.length > 35 ? 
                   invoice.fileName.substring(0, 32) + '...' : 
                   invoice.fileName;

  // ZURÜCK zur Original-Nachricht (editieren, nicht neu erstellen!)
  await ctx.editMessageText(
    `📋 <b>Neue Rechnung</b>\n\n` +
    `📄 <b>Datei:</b> ${shortName}\n` +
    `💰 <b>Typ:</b> ${invoice.type}\n` +
    `🏢 <b>Projekt:</b> ${invoice.project}\n` +
    `📅 <b>Datum:</b> ${invoice.date}\n` +
    `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>\n\n` +
    `<b>Status:</b> Ausstehend ⏳`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ BEZAHLT', `p_${invoice.id}`),
          Markup.button.callback('⏰ ERINNERUNG', `r_${invoice.id}`)
        ],
        [
          Markup.button.callback('🔄 RÜCKGÄNGIG', `u_${invoice.id}`)
        ]
      ]),
      disable_web_page_preview: true 
    }
  );
});

// ERINNERUNG Button
bot.action(/^r_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const invoice = invoices.get(id);
  
  if (!invoice) {
    await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
    return;
  }

  await ctx.answerCbQuery('📅 Tag wählen:');

  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('Mo', `rd_${id}_1`),
      Markup.button.callback('Di', `rd_${id}_2`),
      Markup.button.callback('Mi', `rd_${id}_3`)
    ],
    [
      Markup.button.callback('Do', `rd_${id}_4`),
      Markup.button.callback('Fr', `rd_${id}_5`)
    ]
  ]);

  const shortName = invoice.fileName.length > 35 ? 
                   invoice.fileName.substring(0, 32) + '...' : 
                   invoice.fileName;

  await ctx.editMessageText(
    `📅 <b>Erinnerung setzen</b>\n\n` +
    `📄 <b>Rechnung:</b> ${shortName}\n\n` +
    `Welcher Tag?`,
    { parse_mode: 'HTML', ...buttons }
  );
});

// Tag gewählt
bot.action(/^rd_(.+)_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const day = parseInt(ctx.match[2]);
  
  await ctx.answerCbQuery('🕐 Zeit wählen:');

  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('10:00', `dt_${id}_${day}_10`),
      Markup.button.callback('16:00', `dt_${id}_${day}_16`)
    ]
  ]);

  const dayNames = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  
  await ctx.editMessageText(
    `🕐 <b>Uhrzeit wählen</b>\n\n` +
    `📅 <b>Tag:</b> ${dayNames[day]}\n\n` +
    `Welche Uhrzeit?`,
    { parse_mode: 'HTML', ...buttons }
  );
});

// Zeit gewählt - Erinnerung setzen
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
    const shortName = invoice.fileName.length > 35 ? 
                     invoice.fileName.substring(0, 32) + '...' : 
                     invoice.fileName;
    
    // EDITIERE Original-Nachricht zu "Erinnerung gesetzt"
    await ctx.editMessageText(
      `⏰ <b>Erinnerung gesetzt</b>\n\n` +
      `📄 <b>Datei:</b> ${shortName}\n` +
      `💰 <b>Typ:</b> ${invoice.type}\n` +
      `🏢 <b>Projekt:</b> ${invoice.project}\n` +
      `📅 <b>Datum:</b> ${invoice.date}\n` +
      `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>\n\n` +
      `⏰ <b>Erinnerung:</b> ${dayNames[targetDay]}, ${formattedDate} um ${targetHour}:00 Uhr\n` +
      `<b>Status:</b> Ausstehend mit Erinnerung 🔔`,
      { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ BEZAHLT', `p_${invoice.id}`)
          ],
          [
            Markup.button.callback('⏰ NEUE ERINNERUNG', `r_${invoice.id}`),
            Markup.button.callback('🔄 RÜCKGÄNGIG', `u_${invoice.id}`)
          ]
        ]),
        disable_web_page_preview: true 
      }
    );
    
  } catch (error) {
    console.error('Erinnerung Fehler:', error);
    ctx.reply('❌ Fehler beim Setzen der Erinnerung.');
  }
});

// =============== REMINDER NOTIFICATION ===============
function sendReminderNotification(telegram, chatId, invoice) {
  const shortName = invoice.fileName.length > 35 ? 
                   invoice.fileName.substring(0, 32) + '...' : 
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

  const message = 
    `🔔 <b>ERINNERUNG</b>\n\n` +
    `📄 <b>Rechnung:</b> ${shortName}\n` +
    `💰 <b>Typ:</b> ${invoice.type}\n` +
    `🏢 <b>Projekt:</b> ${invoice.project}\n` +
    `📅 <b>Datum:</b> ${invoice.date}\n` +
    `⏰ <b>Zeit:</b> ${new Date().toLocaleTimeString('de-DE')}\n\n` +
    `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>\n\n` +
    `⚠️ <b>Diese Rechnung ist noch nicht bezahlt!</b>`;

  telegram.sendMessage(chatId, message, { 
    parse_mode: 'HTML', 
    ...buttons,
    disable_web_page_preview: true 
  });
}

// Snooze (2h später erinnern)
bot.action(/^s_(.+)_(.+)/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const hours = parseInt(ctx.match[2]);
  
  await ctx.answerCbQuery(`⏰ Erinnere in ${hours}h`);
  
  const timerId = setTimeout(() => {
    const invoice = invoices.get(id);
    if (invoice && invoice.status === 'pending') {
      sendReminderNotification(ctx.telegram, ctx.chat.id, invoice);
    }
    reminders.delete(`${id}_snooze`);
  }, hours * 60 * 60 * 1000);
  
  reminders.set(`${id}_snooze`, timerId);
});

// =============== ADMIN COMMANDS ===============
bot.command('start', async (ctx) => {
  const message = 
    `🤖 <b>A&A Backoffice Bot gestartet!</b>\n\n` +
    `📋 <b>Funktionen:</b>\n` +
    `✅ Rechnungen verarbeiten\n` +
    `💰 Bezahlt/Rückgängig\n` +
    `⏰ Erinnerungen (Mo-Fr, 10/16 Uhr)\n` +
    `📁 Drive-Integration\n\n` +
    `<b>Test:</b> /rechnung\n` +
    `<b>Status:</b> /status`;

  await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('rechnung', async (ctx) => {
  const testInvoice = {
    id: 999,
    fileName: 'mahnung_TestProjekt_2025_09_12.pdf',
    type: 'mahnung',
    project: 'TestProjekt',
    date: '2025_09_12',
    fileId: 'test123',
    driveUrl: 'https://drive.google.com/file/d/test123/view',
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  invoices.set(999, testInvoice);
  await sendInvoiceMessage(ctx, testInvoice);
});

bot.command('status', async (ctx) => {
  const memory = getMemoryUsage();
  const activeInvoices = Array.from(invoices.values()).filter(inv => inv.status === 'pending').length;
  const activeReminders = reminders.size;
  const uptime = Math.floor(process.uptime() / 60);

  const message = 
    `📊 <b>Bot Status</b>\n\n` +
    `📄 <b>Aktive Rechnungen:</b> ${activeInvoices}\n` +
    `⏰ <b>Aktive Erinnerungen:</b> ${activeReminders}\n` +
    `💾 <b>Memory:</b> ${memory.heapUsed}MB / 512MB\n` +
    `🔵 <b>Uptime:</b> ${uptime} Min\n` +
    `✅ <b>Status:</b> Online ✅`;

  await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('memory', async (ctx) => {
  const memory = getMemoryUsage();
  const message = 
    `💾 <b>Memory Details</b>\n\n` +
    `<b>RSS:</b> ${memory.rss}MB\n` +
    `<b>Heap Used:</b> ${memory.heapUsed}MB\n` +
    `<b>Heap Total:</b> ${memory.heapTotal}MB\n` +
    `<b>External:</b> ${memory.external}MB\n\n` +
    `<b>Invoices:</b> ${invoices.size}\n` +
    `<b>Reminders:</b> ${reminders.size}`;

  await ctx.reply(message, { parse_mode: 'HTML' });
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





