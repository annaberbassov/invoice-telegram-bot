// 1. Core modules
const http = require('http');
const https = require('https');
// 2. npm modules  
const { Telegraf, Markup } = require('telegraf');
// 3. Own modules - 🆕 ERWEITERT!
const { saveMessageId, getMessageData, saveInvoiceData, loadAllInvoices, getInvoiceData } = require('./storage');

console.log('🚀 A&A Backoffice Bot startet...');
const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// 🆕 NEU HINZUFÜGEN - direkt nach den Konstanten:
// =============== BOT STATE MANAGEMENT ===============
const invoices = new Map();
const reminders = new Map();

// 🆕 Load invoices from database on startup
(async () => {
  const persistentInvoices = await loadAllInvoices();
  for (const [id, invoice] of Object.entries(persistentInvoices)) {
    invoices.set(parseInt(id), invoice);
  }
  console.log(`✅ Loaded ${Object.keys(persistentInvoices).length} invoices from database`);
})();

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
  
  const APPS_SCRIPT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbyDONFHC6_mHc5WGA4pzcwjR6c3xLilmwj9z-TLNSeTy99Rg0xNapmy8AW1n7GEOCt0_w/exec';
  
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
  // Explizit CEST verwenden
  const options = { timeZone: 'Europe/Berlin' };
  const now = new Date();
  
  // Aktuelle Zeit in CEST
  const cestNow = new Date(now.toLocaleString('en-US', options));
  
  const currentDay = cestNow.getDay();
  const currentHour = cestNow.getHours();

  console.log(`🕐 Debug: Jetzt ${currentDay} (${cestNow.toLocaleString('de-DE')}), Ziel: ${weekday} um ${hour}:00`);

  let daysUntilTarget = weekday - currentDay;
  
  if (daysUntilTarget < 0 || (daysUntilTarget === 0 && currentHour >= hour)) {
    daysUntilTarget += 7;
  }

  // Zielzeit in CEST berechnen  
  const targetDate = new Date(cestNow);
  targetDate.setDate(cestNow.getDate() + daysUntilTarget);
  targetDate.setHours(hour, 0, 0, 0);
  
  const minutesUntil = Math.round((targetDate.getTime() - cestNow.getTime()) / 1000 / 60);
  console.log(`⏰ Erinnerung in ${minutesUntil} Min (${Math.round(minutesUntil/60)} Stunden)`);
  
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
      fileName: invoiceData.name,
      type: invoiceData.keyword,
      project: invoiceData.project,
      date: invoiceData.date,
      fileId: invoiceData.fileId,
      driveUrl: invoiceData.url,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
// 🆕 NEU: Save to database und ID bekommen
const newId = await saveInvoiceData(invoice);
if (newId) {
  invoice.id = newId;
  invoices.set(newId, invoice);
  await sendInvoiceMessage(ctx, invoice);
} else {
  console.error('❌ Failed to save invoice to database');
  await ctx.reply('❌ Fehler beim Speichern der Rechnung');
}


    
  } catch (error) {
    console.error('Invoice Data Error:', error);
    try {
      await ctx.reply('❌ Fehler beim Verarbeiten der Rechnungsdaten');
    } catch (e) {
      console.log('⚠️ Reply Error:', e.message);
    }
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

  try {
  const sentMessage = await ctx.reply(message, { 
  parse_mode: 'HTML', 
  ...buttons,
  disable_web_page_preview: true 
});

// 🆕 Message ID speichern für später!
await saveMessageId(invoice.id, sentMessage.message_id, ctx.chat.id);
console.log(`✅ Saved message_id ${sentMessage.message_id} for invoice ${invoice.id}`);


  } catch (error) {
    console.log('⚠️ Send Message Error:', error.message);
  }
}

// =============== CRASH-SAFE BUTTON HANDLERS ===============

// BEZAHLT Button
bot.action(/^p_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const invoice = invoices.get(id);
    
    if (!invoice) {
      try {
        await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
      } catch (e) {
        console.log('⚠️ Query zu alt (bezahlt):', e.message);
      }
      return;
    }

    try {
      await ctx.answerCbQuery('✅ Als bezahlt markiert!');
    } catch (e) {
      console.log('⚠️ Query zu alt (bezahlt answer):', e.message);
    }

    invoice.status = 'paid';
    invoice.paidDate = new Date().toISOString();

    // Apps Script benachrichtigen
    if (invoice.fileId) {
      notifyAppsScript('move_to_paid', invoice.fileId);
    }

// 🆕 ADMIN BENACHRICHTIGUNG
try {
  await ctx.telegram.sendMessage('928884613', 
    `🔔 <b>ADMIN INFO: RECHNUNG BEZAHLT</b>\n\n` +
    `👤 <b>Von:</b> ${ctx.from.username || ctx.from.first_name}\n` +
    `📄 <b>Rechnung:</b> ${invoice.fileName.substring(0, 35)}\n` +
    `💰 <b>Projekt:</b> ${invoice.project}\n` +
    `⏰ <b>Zeit:</b> ${new Date().toLocaleString('de-DE')}\n\n` +
    `✅ Automatisch auf BEZAHLT gesetzt!`,
    { parse_mode: 'HTML' }
  );
} catch (e) {
  console.log('⚠️ Admin notification failed:', e.message);
}
    const shortName = invoice.fileName.length > 35 ? 
                     invoice.fileName.substring(0, 32) + '...' : 
                     invoice.fileName;

    // EDITIERE die bestehende Nachricht (keine neue!)
    try {
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
    } catch (e) {
      console.log('⚠️ Edit Message Error (bezahlt):', e.message);
    }

    // Erinnerungen löschen
    clearRemindersForInvoice(id);

  } catch (error) {
    console.log('⚠️ Button Error (bezahlt):', error.message);
  }
});

// RÜCKGÄNGIG Button
bot.action(/^u_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const invoice = invoices.get(id);
    
    if (!invoice) {
      try {
        await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
      } catch (e) {
        console.log('⚠️ Query zu alt (rückgängig):', e.message);
      }
      return;
    }

    try {
      await ctx.answerCbQuery('🔄 Rückgängig gemacht!');
    } catch (e) {
      console.log('⚠️ Query zu alt (rückgängig answer):', e.message);
    }

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
    try {
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
    } catch (e) {
      console.log('⚠️ Edit Message Error (rückgängig):', e.message);
    }

  } catch (error) {
    console.log('⚠️ Button Error (rückgängig):', error.message);
  }
});

// ERINNERUNG Button
bot.action(/^r_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const invoice = invoices.get(id);
    
    if (!invoice) {
      try {
        await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
      } catch (e) {
        console.log('⚠️ Query zu alt (erinnerung):', e.message);
      }
      return;
    }

    try {
      await ctx.answerCbQuery('📅 Tag wählen:');
    } catch (e) {
      console.log('⚠️ Query zu alt (erinnerung answer):', e.message);
    }

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

    try {
      await ctx.editMessageText(
        `📅 <b>Erinnerung setzen</b>\n\n` +
        `📄 <b>Rechnung:</b> ${shortName}\n\n` +
        `Welcher Tag?`,
        { parse_mode: 'HTML', ...buttons }
      );
    } catch (e) {
      console.log('⚠️ Edit Message Error (erinnerung):', e.message);
    }

  } catch (error) {
    console.log('⚠️ Button Error (erinnerung):', error.message);
  }
});

// Tag gewählt
bot.action(/^rd_(.+)_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const day = parseInt(ctx.match[2]);
    
    try {
      await ctx.answerCbQuery('🕐 Zeit wählen:');
    } catch (e) {
      console.log('⚠️ Query zu alt (tag):', e.message);
    }

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('10:00', `dt_${id}_${day}_10`),
        Markup.button.callback('16:00', `dt_${id}_${day}_16`)
      ]
    ]);

    const dayNames = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    
    try {
      await ctx.editMessageText(
        `🕐 <b>Uhrzeit wählen</b>\n\n` +
        `📅 <b>Tag:</b> ${dayNames[day]}\n\n` +
        `Welche Uhrzeit?`,
        { parse_mode: 'HTML', ...buttons }
      );
    } catch (e) {
      console.log('⚠️ Edit Message Error (tag):', e.message);
    }

  } catch (error) {
    console.log('⚠️ Button Error (tag):', error.message);
  }
});

// Zeit gewählt - Erinnerung setzen
bot.action(/^dt_(.+)_(.+)_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const targetDay = parseInt(ctx.match[2]);
    const targetHour = parseInt(ctx.match[3]);
    const invoice = invoices.get(id);
    
    if (!invoice) {
      try {
        await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
      } catch (e) {
        console.log('⚠️ Query zu alt (zeit):', e.message);
      }
      return;
    }

    try {
      await ctx.answerCbQuery('✅ Erinnerung gesetzt!');
    } catch (e) {
      console.log('⚠️ Query zu alt (zeit answer):', e.message);
    }

    const reminderDate = getNextWeekday(targetDay, targetHour);
    // ✅ RICHTIG (beide CEST):
const now = new Date();
const cestNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
const timeUntilReminder = reminderDate.getTime() - cestNow.getTime();

    
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
    try {
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
    } catch (e) {
      console.log('⚠️ Edit Message Error (zeit):', e.message);
    }
    
  } catch (error) {
    console.error('Erinnerung Fehler:', error);
  }
});
// GOTO Button - Zur Original-Rechnung springen
bot.action(/^goto_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const invoice = invoices.get(id);
    
    if (!invoice) {
      try {
        await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
      } catch (e) {
        console.log('⚠️ Query zu alt (goto):', e.message);
      }
      return;
    }
    
    try {
      await ctx.answerCbQuery('📋 Zur Original-Rechnung...');
    } catch (e) {
      console.log('⚠️ Query zu alt (goto answer):', e.message);
    }
    
    // Original-Message finden und zu "Erinnerungs-Modus" editieren
   const msgData = await getMessageData(invoice.id);
    if (msgData && msgData.message_id && msgData.chat_id) {
      const shortName = invoice.fileName.length > 35 ? 
                       invoice.fileName.substring(0, 32) + '...' : 
                       invoice.fileName;
                       
      try {
        await ctx.telegram.editMessageText(
          msgData.chat_id,
          msgData.message_id,
          undefined,
          `🔔 <b>ERINNERUNG</b>\n\n` +
          `📄 <b>Datei:</b> ${shortName}\n` +
          `💰 <b>Typ:</b> ${invoice.type}\n` +
          `🏢 <b>Projekt:</b> ${invoice.project}\n` +
          `📅 <b>Datum:</b> ${invoice.date}\n` +
          `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>\n\n` +
          `⚠️ <b>Diese Rechnung ist noch nicht bezahlt!</b>`,
          { 
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ BEZAHLT', callback_data: `p_${invoice.id}` }],
                [
                  { text: '⏰ NEUE ERINNERUNG', callback_data: `r_${invoice.id}` },
                  { text: '🔄 RÜCKGÄNGIG', callback_data: `u_${invoice.id}` }
                ]
              ]
            },
            disable_web_page_preview: true 
          }
        );
        console.log(`✅ Edited original message to reminder mode for invoice ${invoice.id}`);
      } catch (e) {
        console.log('⚠️ Edit Message Error (goto):', e.message);
      }
    } else {
      console.log(`❌ No message data found for invoice ${invoice.id}`);
    }
  } catch (error) {
    console.log('⚠️ GOTO Button Error:', error.message);
  }
});


// =============== REMINDER NOTIFICATION ===============
async function sendReminderNotification(telegram, chatId, invoice) {
  console.log(`🔍 DEBUG: Looking for message data for invoice ${invoice.id}`);
  const msgData = await getMessageData(invoice.id);
  console.log(`📊 DEBUG: Found message data:`, msgData);
  
  // FALLBACK CHECK
  if (!msgData || !msgData.message_id || !msgData.chat_id) {
    console.log(`❌ DEBUG: No valid message data, sending new message instead`);

    // FALLBACK: Neue Nachricht senden
        // FALLBACK: Neue Nachricht senden mit Link
    const message = 
      `🔔 <b>ERINNERUNG</b>\n\n` +
      `📄 <b>Rechnung:</b> ${invoice.fileName.substring(0, 35)}\n` +
      `⚠️ <b>Noch nicht bezahlt!</b>\n\n` +
      `👆 <b>Klicke unten um zur Original-Rechnung zu springen:</b>`;
      
    // Da msgData im Fallback null ist, verwende default message_id
    const messageLink = msgData?.message_id ? 
      `https://t.me/c/4900809502/${msgData.message_id}` : 
      `https://t.me/c/4900809502/1`;
      
    try {
      telegram.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
       reply_markup: {
  inline_keyboard: [[
    { text: '📋 Zur Original-Rechnung', callback_data: `goto_${invoice.id}` }
  ]]
},
        disable_web_page_preview: true 
      });

      console.log(`✅ DEBUG: Sent fallback reminder for invoice ${invoice.id}`);
    } catch (error) {
      console.log('⚠️ DEBUG: Fallback reminder failed:', error.message);
    }
    return;
  }
  
   console.log(`✅ DEBUG: Attempting dual notification for invoice ${invoice.id}`);
  const shortName = invoice.fileName.length > 35 ? 
                   invoice.fileName.substring(0, 32) + '...' : 
                   invoice.fileName;
  
  // 1️⃣ ORIGINAL MESSAGE EDITIEREN zu "Erinnerung aktiv"
  try {
    await telegram.editMessageText(
      msgData.chat_id,
      msgData.message_id,
      undefined,
      `⏰ <b>Erinnerung aktiv</b>\n\n` +
      `📄 <b>Datei:</b> ${shortName}\n` +
      `💰 <b>Typ:</b> ${invoice.type}\n` +
      `🏢 <b>Projekt:</b> ${invoice.project}\n` +
      `📅 <b>Datum:</b> ${invoice.date}\n` +
      `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>\n\n` +
      `🔔 <b>Erinnerung gesendet um:</b> ${new Date().toLocaleTimeString('de-DE')}\n` +
      `<b>Status:</b> Ausstehend mit Erinnerung 🔔`,
      { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ BEZAHLT', callback_data: `p_${invoice.id}` }],
            [
              { text: '⏰ NEUE ERINNERUNG', callback_data: `r_${invoice.id}` },
              { text: '🔄 RÜCKGÄNGIG', callback_data: `u_${invoice.id}` }
            ]
          ]
        },
        disable_web_page_preview: true 
      }
    );
    console.log(`✅ DEBUG: Successfully updated original message to reminder-active status`);
  } catch (error) {
    console.log('⚠️ DEBUG: Original message edit failed:', error.message);
  }
  
  // 2️⃣ NEUE ERINNERUNGS-NACHRICHT SENDEN
  const reminderMessage = 
    `🔔 <b>ERINNERUNG</b>\n\n` +
    `📄 <b>Rechnung:</b> ${invoice.fileName.substring(0, 35)}\n` +
    `⚠️ <b>Noch nicht bezahlt!</b>\n\n` +
    `👆 <b>Klicke unten um zur Original-Rechnung zu springen:</b>`;
      
  try {
    await telegram.sendMessage(chatId, reminderMessage, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '📋 Zur Original-Rechnung', callback_data: `goto_${invoice.id}` }
        ]]
      },
      disable_web_page_preview: true 
    });
    console.log(`✅ DEBUG: Successfully sent new reminder message for invoice ${invoice.id}`);
  } catch (error) {
    console.log('⚠️ DEBUG: New reminder message failed:', error.message);
  }







