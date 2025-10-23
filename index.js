// 1. Core modules
const http = require('http');
const https = require('https');
// 2. npm modules  
const { Telegraf, Markup } = require('telegraf');
// 3. Own modules - 🆕 ERWEITERT!
const { 
  saveMessageId, 
  getMessageData, 
  saveInvoiceData, 
  loadAllInvoices, 
  getInvoiceData,
  // Action functions
  saveActionMessageId,
  getActionMessageData,
  saveActionData,
  loadAllActions,
  getActionData
} = require('./storage');


console.log('🚀 A&A Backoffice Bot startet...');
const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// 🆕 NEU HINZUFÜGEN - direkt nach den Konstanten:
// =============== BOT STATE MANAGEMENT ===============
const invoices = new Map();
const reminders = new Map();
const actions = new Map();
const actionReminders = new Map();

// 🆕 Load invoices from database on startup
(async () => {
  const persistentInvoices = await loadAllInvoices();
  for (const [id, invoice] of Object.entries(persistentInvoices)) {
    invoices.set(parseInt(id), invoice);
  }
  console.log(`✅ Loaded ${Object.keys(persistentInvoices).length} invoices from database`);
})();
// Load actions from database on startup
(async () => {
  const persistentActions = await loadAllActions();
  for (const [id, action] of Object.entries(persistentActions)) {
    actions.set(parseInt(id), action);
  }
  console.log(`✅ Loaded ${Object.keys(persistentActions).length} actions from database`);
})();

// HTTP Server mit Webhook Handler
const server = http.createServer((req, res) => {
  // NEUER ENDPOINT 1: Get Action Message
  if (req.url === '/api/get_action_message' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { fileId } = JSON.parse(body);
        
        // Suche Action
        let foundAction = null;
        for (const [id, action] of actions.entries()) {
          if (action.fileId === fileId) {
            foundAction = action;
            break;
          }
        }
        
     if (!foundAction) {
  // Fallback: Load from database
  const allActionsFromDb = await loadAllActions();
  for (const [id, action] of Object.entries(allActionsFromDb)) {
    if (action.fileId === fileId) {
      foundAction = action;
      foundAction.id = parseInt(id);
      break;
    }
  }
}

if (!foundAction) {
  res.writeHead(404, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({ error: 'Action not found' }));
  return;
}

        
        const msgData = await getActionMessageData(foundAction.id);
        
        if (!msgData) {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Message not found' }));
          return;
        }
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          action_id: foundAction.id,
          message_id: msgData.message_id,
          chat_id: msgData.chat_id,
          fileName: foundAction.fileName,
          project: foundAction.project
        }));
      } catch (e) {
        console.error('API Error:', e);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }
  // NEUER ENDPOINT 2: Send Deadline Warning
  else if (req.url === '/api/send_deadline_warning' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { message_id, chat_id, fileName, actionType, project, deadline, daysUntil } = JSON.parse(body);
        
        let urgencyIcon = '🔔';
        let urgencyText = `Noch ${daysUntil} Tag${daysUntil === 1 ? '' : 'e'}`;
        
        if (daysUntil === 0) {
          urgencyIcon = '🚨';
          urgencyText = 'HEUTE';
        } else if (daysUntil === 1) {
          urgencyIcon = '⚠️';
          urgencyText = 'MORGEN';
        }
        
        const warningMessage = 
          `${urgencyIcon} <b>DEADLINE-WARNUNG</b>\n\n` +
          `📄 <b>Action:</b> ${fileName.substring(0, 40)}\n` +
          `📋 <b>Typ:</b> ${actionType}\n` +
          `🏢 <b>Projekt:</b> ${project || 'Unbekannt'}\n` +
          `📅 <b>Deadline:</b> ${deadline}\n\n` +
          `⏰ <b>${urgencyText} bis zur Deadline!</b>\n` +
          `💡 <b>Original-Action siehe oben! ☝️</b>`;
        
        await bot.telegram.sendMessage(chat_id, warningMessage, {
          parse_mode: 'HTML',
          reply_to_message_id: parseInt(message_id),
          disable_web_page_preview: true
        });
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error('Send warning error:', e);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }
  // EXISTING WEBHOOK
  else if (req.url === '/webhook' && req.method === 'POST') {

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
function notifyAppsScript(action, fileId, projectName = null) {
  console.log(`📤 Apps Script: ${action} für ${fileId}${projectName ? ` (Projekt: ${projectName})` : ''}`);
  
  const APPS_SCRIPT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbyDONFHC6_mHc5WGA4pzcwjR6c3xLilmwj9z-TLNSeTy99Rg0xNapmy8AW1n7GEOCt0_w/exec';
  
  const payload = JSON.stringify({
    action: action,
    fileId: fileId,
    projectName: projectName  // NEU: Projekt-Name für intelligente Sortierung
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
      date: invoiceData.date,           // ← Rechnungsdatum
      dueDate: invoiceData.dueDate,     // ← NEU: Fälligkeitsdatum
      amount: invoiceData.amount,       // ← NEU: Betrag
      fileId: invoiceData.fileId,
      driveUrl: invoiceData.url,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // 🆕 Save to database und ID bekommen
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

  // ✅ Format dates properly
  const dateStr = invoice.date || 'Nicht gefunden';
  const dueDateStr = invoice.dueDate ? 
    invoice.dueDate.replace(/_/g, '.') :  // Format: 2025_10_15 → 15.10.2025
    null;
  const amountStr = invoice.amount || '';

  const message = 
    `📋 <b>Neue Rechnung</b>\n\n` +
    `📄 <b>Datei:</b> ${shortName}\n` +
    `💰 <b>Typ:</b> ${invoice.type}\n` +
    `🏢 <b>Projekt:</b> ${invoice.project}\n` +
    (amountStr ? `💵 <b>Betrag:</b> ${amountStr}\n` : '') +  // ← NEU: Betrag
    `📅 <b>Datum:</b> ${dateStr}\n` +
    (dueDateStr ? `⏰ <b>Fällig:</b> ${dueDateStr}\n` : '') +  // ← NEU: Fälligkeitsdatum
    `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>\n\n` +
    `<b>Status:</b> Ausstehend ⏳`;

  try {
    const sentMessage = await ctx.reply(message, { 
      parse_mode: 'HTML', 
      ...buttons,
      disable_web_page_preview: true 
    });

    // Message ID speichern
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

// IN 2H ERINNERN Button
bot.action(/^s_(.+)_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const hours = parseInt(ctx.match[2]);
    const invoice = invoices.get(id);
    
    if (!invoice) {
      try {
        await ctx.answerCbQuery('❌ Rechnung nicht gefunden');
      } catch (e) {
        console.log('⚠️ Query zu alt (in2h):', e.message);
      }
      return;
    }
    
    try {
      await ctx.answerCbQuery(`✅ Erinnerung in ${hours}h gesetzt!`);
    } catch (e) {
      console.log('⚠️ Query zu alt (in2h answer):', e.message);
    }
    
    const timeUntilReminder = hours * 60 * 60 * 1000; // Stunden zu Millisekunden
    
    const timerId = setTimeout(async () => {
      await sendReminderNotification(ctx.telegram, ctx.chat.id, invoice);
      reminders.delete(`${id}_reminder`);
    }, timeUntilReminder);
    
    // Alten Timer löschen falls vorhanden
    clearRemindersForInvoice(id);
    reminders.set(`${id}_reminder`, timerId);
    
    console.log(`⏰ In-${hours}h Erinnerung ${id}: ${hours*60} Min`);
    
    // Original-Message zu "neue Erinnerung gesetzt" editieren
    const shortName = invoice.fileName.length > 35 ? 
                     invoice.fileName.substring(0, 32) + '...' : 
                     invoice.fileName;
    
    try {
      await ctx.editMessageText(
        `⏰ <b>Neue Erinnerung gesetzt</b>\n\n` +
        `📄 <b>Datei:</b> ${shortName}\n` +
        `💰 <b>Typ:</b> ${invoice.type}\n` +
        `🏢 <b>Projekt:</b> ${invoice.project}\n` +
        `📅 <b>Datum:</b> ${invoice.date}\n` +
        `🔗 <a href="${invoice.driveUrl}">Drive-Link</a>\n\n` +
        `⏰ <b>Erinnerung in ${hours} Stunden</b>\n` +
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
    } catch (e) {
      console.log('⚠️ Edit Message Error (in2h):', e.message);
    }
    
  } catch (error) {
    console.log('⚠️ In 2h Button Error:', error.message);
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
  `💡 <b>Original-Rechnung siehe oben!</b>`;
    
try {
  await telegram.sendMessage(chatId, reminderMessage, { 
    parse_mode: 'HTML',
    reply_to_message_id: parseInt(msgData.message_id),
    disable_web_page_preview: true 
  });
  console.log(`✅ DEBUG: Successfully sent reminder reply for invoice ${invoice.id}`);
} catch (error) {
  console.log('⚠️ DEBUG: Reminder reply failed:', error.message);
}
}

// ===============================================
// ACTION SYSTEM HANDLERS (NEU)
// ===============================================

// ACTION DATA PROCESSING
bot.hears(/^\/action_data:(.+)/, async (ctx) => {
  try {
    const jsonData = ctx.match[1];
    const actionData = JSON.parse(jsonData);
    
    const action = {
      fileName: actionData.name,
      actionType: actionData.actionType,
      project: actionData.project,
      deadline: actionData.deadline,
      fileId: actionData.fileId,
      driveUrl: actionData.url,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // Save to database
    const newId = await saveActionData(action);
    if (newId) {
      action.id = newId;
      actions.set(newId, action);
      await sendActionMessage(ctx, action);
    } else {
      console.error('❌ Failed to save action to database');
      await ctx.reply('❌ Fehler beim Speichern der Action');
    }
    
  } catch (error) {
    console.error('Action Data Error:', error);
    try {
      await ctx.reply('❌ Fehler beim Verarbeiten der Action-Daten');
    } catch (e) {
      console.log('⚠️ Reply Error:', e.message);
    }
  }
});

async function sendActionMessage(ctx, action) {
  const shortName = action.fileName.length > 35 ? 
                   action.fileName.substring(0, 32) + '...' : 
                   action.fileName;

  const deadlineStr = action.deadline ? 
    new Date(action.deadline).toLocaleDateString('de-DE') : 
    'Keine Deadline';

  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ ERLEDIGT', `a_done_${action.id}`),
      Markup.button.callback('⏰ ERINNERUNG', `a_remind_${action.id}`)
    ],
    [
      Markup.button.callback('🔄 RÜCKGÄNGIG', `a_undo_${action.id}`)
    ]
  ]);

  const message = 
    `✅ <b>[AKTION] Neue Aufgabe</b>\n\n` +
    `📄 <b>Datei:</b> ${shortName}\n` +
    `📋 <b>Typ:</b> ${action.actionType}\n` +
    `🏢 <b>Projekt:</b> ${action.project || 'Unbekannt'}\n` +
    `📅 <b>Deadline:</b> ${deadlineStr}\n` +
    `🔗 <a href="${action.driveUrl}">Drive-Link</a>\n\n` +
    `<b>Status:</b> Ausstehend ⏳`;

  try {
    const sentMessage = await ctx.reply(message, { 
      parse_mode: 'HTML', 
      ...buttons,
      disable_web_page_preview: true 
    });

    // Save message ID
    await saveActionMessageId(action.id, sentMessage.message_id, ctx.chat.id);
    console.log(`✅ Saved message_id ${sentMessage.message_id} for action ${action.id}`);

  } catch (error) {
    console.log('⚠️ Send Message Error:', error.message);
  }
}

// ERLEDIGT Button
bot.action(/^a_done_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const action = actions.get(id);
    
    if (!action) {
      try {
        await ctx.answerCbQuery('❌ Action nicht gefunden');
      } catch (e) {
        console.log('⚠️ Query zu alt (erledigt):', e.message);
      }
      return;
    }

    try {
      await ctx.answerCbQuery('✅ Als erledigt markiert!');
    } catch (e) {
      console.log('⚠️ Query zu alt (erledigt answer):', e.message);
    }

    action.status = 'done';
    action.completedAt = new Date().toISOString();

    // Apps Script benachrichtigen (mit Projekt für intelligente Sortierung)
    if (action.fileId) {
      notifyAppsScript('move_action_done', action.fileId, action.project);
    }

    const shortName = action.fileName.length > 35 ? 
                     action.fileName.substring(0, 32) + '...' : 
                     action.fileName;

    const deadlineStr = action.deadline ? 
      new Date(action.deadline).toLocaleDateString('de-DE') : 
      'Keine Deadline';

    // Update Nachricht
    try {
      await ctx.editMessageText(
        `✅ <b>[AKTION] ERLEDIGT</b>\n\n` +
        `📄 <b>Datei:</b> ${shortName}\n` +
        `📋 <b>Typ:</b> ${action.actionType}\n` +
        `🏢 <b>Projekt:</b> ${action.project || 'Unbekannt'}\n` +
        `📅 <b>Deadline war:</b> ${deadlineStr}\n` +
        `✅ <b>Erledigt:</b> ${new Date().toLocaleDateString('de-DE')}\n` +
        `⏰ <b>Zeit:</b> ${new Date().toLocaleTimeString('de-DE')}\n\n` +
        `🔗 <a href="${action.driveUrl}">Drive-Link</a>`,
        { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 RÜCKGÄNGIG MACHEN', `a_undo_${action.id}`)]
          ]),
          disable_web_page_preview: true 
        }
      );
    } catch (e) {
      console.log('⚠️ Edit Message Error (erledigt):', e.message);
    }

    // Erinnerungen löschen
    clearActionReminders(id);

  } catch (error) {
    console.log('⚠️ Button Error (erledigt):', error.message);
  }
});

// RÜCKGÄNGIG Button
bot.action(/^a_undo_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const action = actions.get(id);
    
    if (!action) {
      try {
        await ctx.answerCbQuery('❌ Action nicht gefunden');
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

    action.status = 'pending';
    delete action.completedAt;

    // Apps Script - zurück zum Action Required Ordner
    if (action.fileId) {
      notifyAppsScript('move_to_action_required', action.fileId);
    }

    // Erinnerungen löschen
    clearActionReminders(id);

    const shortName = action.fileName.length > 35 ? 
                     action.fileName.substring(0, 32) + '...' : 
                     action.fileName;

    const deadlineStr = action.deadline ? 
      new Date(action.deadline).toLocaleDateString('de-DE') : 
      'Keine Deadline';

    // Zurück zur Original-Nachricht
    try {
      await ctx.editMessageText(
        `✅ <b>[AKTION] Neue Aufgabe</b>\n\n` +
        `📄 <b>Datei:</b> ${shortName}\n` +
        `📋 <b>Typ:</b> ${action.actionType}\n` +
        `🏢 <b>Projekt:</b> ${action.project || 'Unbekannt'}\n` +
        `📅 <b>Deadline:</b> ${deadlineStr}\n` +
        `🔗 <a href="${action.driveUrl}">Drive-Link</a>\n\n` +
        `<b>Status:</b> Ausstehend ⏳`,
        { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ ERLEDIGT', `a_done_${action.id}`),
              Markup.button.callback('⏰ ERINNERUNG', `a_remind_${action.id}`)
            ],
            [
              Markup.button.callback('🔄 RÜCKGÄNGIG', `a_undo_${action.id}`)
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

// ERINNERUNG Button (gleiches System wie bei Invoices)
bot.action(/^a_remind_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const action = actions.get(id);
    
    if (!action) {
      try {
        await ctx.answerCbQuery('❌ Action nicht gefunden');
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
        Markup.button.callback('Mo', `ard_${id}_1`),
        Markup.button.callback('Di', `ard_${id}_2`),
        Markup.button.callback('Mi', `ard_${id}_3`)
      ],
      [
        Markup.button.callback('Do', `ard_${id}_4`),
        Markup.button.callback('Fr', `ard_${id}_5`)
      ]
    ]);

    const shortName = action.fileName.length > 35 ? 
                     action.fileName.substring(0, 32) + '...' : 
                     action.fileName;

    try {
      await ctx.editMessageText(
        `📅 <b>Erinnerung setzen</b>\n\n` +
        `📄 <b>Action:</b> ${shortName}\n\n` +
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

// Tag gewählt (Action)
bot.action(/^ard_(.+)_(.+)/, async (ctx) => {
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
        Markup.button.callback('10:00', `adt_${id}_${day}_10`),
        Markup.button.callback('16:00', `adt_${id}_${day}_16`)
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

// Zeit gewählt - Erinnerung setzen (Action)
bot.action(/^adt_(.+)_(.+)_(.+)/, async (ctx) => {
  try {
    const id = parseInt(ctx.match[1]);
    const targetDay = parseInt(ctx.match[2]);
    const targetHour = parseInt(ctx.match[3]);
    const action = actions.get(id);
    
    if (!action) {
      try {
        await ctx.answerCbQuery('❌ Action nicht gefunden');
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
    const now = new Date();
    const cestNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const timeUntilReminder = reminderDate.getTime() - cestNow.getTime();

    if (timeUntilReminder > 0 && timeUntilReminder < 7 * 24 * 60 * 60 * 1000) {
      const timerId = setTimeout(() => {
        sendActionReminderNotification(ctx.telegram, ctx.chat.id, action);
        actionReminders.delete(`${id}_reminder`);
      }, timeUntilReminder);
      
      clearActionReminders(id);
      actionReminders.set(`${id}_reminder`, timerId);
      
      console.log(`⏰ Action Erinnerung ${id}: ${Math.round(timeUntilReminder/1000/60)} Min`);
    }
    
    const dayNames = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    const formattedDate = reminderDate.toLocaleDateString('de-DE');
    const shortName = action.fileName.length > 35 ? 
                     action.fileName.substring(0, 32) + '...' : 
                     action.fileName;
    
    const deadlineStr = action.deadline ? 
      new Date(action.deadline).toLocaleDateString('de-DE') : 
      'Keine Deadline';
    
    try {
      await ctx.editMessageText(
        `⏰ <b>[AKTION] Erinnerung gesetzt</b>\n\n` +
        `📄 <b>Datei:</b> ${shortName}\n` +
        `📋 <b>Typ:</b> ${action.actionType}\n` +
        `🏢 <b>Projekt:</b> ${action.project || 'Unbekannt'}\n` +
        `📅 <b>Deadline:</b> ${deadlineStr}\n` +
        `🔗 <a href="${action.driveUrl}">Drive-Link</a>\n\n` +
        `⏰ <b>Erinnerung:</b> ${dayNames[targetDay]}, ${formattedDate} um ${targetHour}:00 Uhr\n` +
        `<b>Status:</b> Ausstehend mit Erinnerung 🔔`,
        { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ ERLEDIGT', `a_done_${action.id}`)
            ],
            [
              Markup.button.callback('⏰ NEUE ERINNERUNG', `a_remind_${action.id}`),
              Markup.button.callback('🔄 RÜCKGÄNGIG', `a_undo_${action.id}`)
            ]
          ]),
          disable_web_page_preview: true 
        }
      );
    } catch (e) {
      console.log('⚠️ Edit Message Error (zeit):', e.message);
    }
    
  } catch (error) {
    console.error('Action Erinnerung Fehler:', error);
  }
});

// ACTION REMINDER NOTIFICATION
async function sendActionReminderNotification(telegram, chatId, action) {
  console.log(`🔍 DEBUG: Looking for action message data for action ${action.id}`);
  const msgData = await getActionMessageData(action.id);
  console.log(`📊 DEBUG: Found action message data:`, msgData);
  
  if (!msgData || !msgData.message_id || !msgData.chat_id) {
    console.log(`❌ DEBUG: No valid message data, sending new message instead`);

    const message = 
      `🔔 <b>[AKTION] ERINNERUNG</b>\n\n` +
      `📄 <b>Action:</b> ${action.fileName.substring(0, 35)}\n` +
      `⚠️ <b>Noch nicht erledigt!</b>`;
      
    try {
      telegram.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 Zur Original-Action', callback_data: `goto_a_${action.id}` }
          ]]
        },
        disable_web_page_preview: true 
      });

      console.log(`✅ DEBUG: Sent fallback reminder for action ${action.id}`);
    } catch (error) {
      console.log('⚠️ DEBUG: Fallback reminder failed:', error.message);
    }
    return;
  }
  
  console.log(`✅ DEBUG: Attempting dual notification for action ${action.id}`);
  const shortName = action.fileName.length > 35 ? 
                   action.fileName.substring(0, 32) + '...' : 
                   action.fileName;
  
  const deadlineStr = action.deadline ? 
    new Date(action.deadline).toLocaleDateString('de-DE') : 
    'Keine Deadline';
  
  // 1. Original Message editieren
  try {
    await telegram.editMessageText(
      msgData.chat_id,
      msgData.message_id,
      undefined,
      `⏰ <b>[AKTION] Erinnerung aktiv</b>\n\n` +
      `📄 <b>Datei:</b> ${shortName}\n` +
      `📋 <b>Typ:</b> ${action.actionType}\n` +
      `🏢 <b>Projekt:</b> ${action.project || 'Unbekannt'}\n` +
      `📅 <b>Deadline:</b> ${deadlineStr}\n` +
      `🔗 <a href="${action.driveUrl}">Drive-Link</a>\n\n` +
      `🔔 <b>Erinnerung gesendet um:</b> ${new Date().toLocaleTimeString('de-DE')}\n` +
      `<b>Status:</b> Ausstehend mit Erinnerung 🔔`,
      { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ ERLEDIGT', callback_data: `a_done_${action.id}` }],
            [
              { text: '⏰ NEUE ERINNERUNG', callback_data: `a_remind_${action.id}` },
              { text: '🔄 RÜCKGÄNGIG', callback_data: `a_undo_${action.id}` }
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
  
  // 2. Neue Erinnerungs-Nachricht als Reply
  const reminderMessage = 
    `🔔 <b>[AKTION] ERINNERUNG</b>\n\n` +
    `📄 <b>Action:</b> ${action.fileName.substring(0, 35)}\n` +
    `⚠️ <b>Noch nicht erledigt!</b>\n\n` +
    `💡 <b>Original-Action siehe oben!</b>`;
    
  try {
    await telegram.sendMessage(chatId, reminderMessage, { 
      parse_mode: 'HTML',
      reply_to_message_id: parseInt(msgData.message_id),
      disable_web_page_preview: true 
    });
    console.log(`✅ DEBUG: Successfully sent reminder reply for action ${action.id}`);
  } catch (error) {
    console.log('⚠️ DEBUG: Reminder reply failed:', error.message);
  }
}

// Helper: Clear Action Reminders
function clearActionReminders(actionId) {
  const reminderKey = `${actionId}_reminder`;
  if (actionReminders.has(reminderKey)) {
    clearTimeout(actionReminders.get(reminderKey));
    actionReminders.delete(reminderKey);
    console.log(`🗑️ Action Timer für ${actionId} gelöscht`);
  }
}




