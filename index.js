const { Telegraf, Markup } = require('telegraf');
const http = require('http');

console.log('🚀 A&A Backoffice Bot startet...');

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// HTTP Server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('A&A Backoffice Bot Running\n');
});

server.listen(PORT, () => {
  console.log(`✅ HTTP Server läuft auf Port ${PORT}`);
});

// Datenstrukturen
const invoiceData = new Map();
const reminders = new Map();

// Apps Script Integration - echte Rechnungen empfangen
bot.command('newInvoice', (ctx) => {
  const text = ctx.message.text;
  const parts = text.match(/"([^"]+)"/g);
  
  if (parts && parts.length >= 6) {
    const invoice = {
      id: parts.replace(/"/g, ''),
      fileName: parts.replace(/"/g, ''),
      type: parts[1].replace(/"/g, ''),
      project: parts.replace(/"/g, ''),
      date: parts.replace(/"/g, ''),
      driveUrl: parts.replace(/"/g, '')
    };
    
    invoiceData.set(invoice.id, invoice);
    sendInvoiceMessage(ctx, invoice);
  }
});

// Test-Rechnung für manuelle Tests
bot.command('rechnung', (ctx) => {
  const invoice = {
    id: `TEST-${Date.now()}`,
    fileName: 'rechnung_test_projekt_2025_09_11.pdf',
    type: 'rechnung',
    project: 'Test Projekt',
    date: '2025_09_11',
    driveUrl: 'https://drive.google.com/file/d/test123/view'
  };
  
  invoiceData.set(invoice.id, invoice);
  sendInvoiceMessage(ctx, invoice);
});

// Einheitliche Rechnungs-Nachricht mit Buttons
function sendInvoiceMessage(ctx, invoice) {
  const shortName = invoice.fileName.length > 45 ? 
                   invoice.fileName.substring(0, 42) + '...' : 
                   invoice.fileName;
  
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Bezahlt', `paid_${invoice.id}`),
      Markup.button.callback('❌ Problem', `problem_${invoice.id}`)
    ],
    [
      Markup.button.callback('⏰ Erinnerung setzen', `reminder_${invoice.id}`)
    ]
  ]);
  
  const message = 
    `📧 Neue Rechnung eingegangen\n\n` +
    `📄 Datei: ${shortName}\n` +
    `💰 Typ: ${invoice.type}\n` +
    `🏢 Projekt: ${invoice.project}\n` +
    `📅 Datum: ${invoice.date}\n` +
    `🔗 [Drive-Link](${invoice.driveUrl})\n\n` +
    `Bitte Aktion wählen:`;
  
  ctx.reply(message, { 
    parse_mode: 'Markdown',
    ...buttons,
    disable_web_page_preview: true 
  });
}

// Bezahlt Button Handler
bot.action(/^paid_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Rechnung als bezahlt markiert! ✅');
  
  const invoice = invoiceData.get(invoiceId);
  const fileName = invoice ? invoice.fileName : invoiceId;
  
  await ctx.editMessageText(
    `✅ Rechnung bezahlt\n\n` +
    `📄 Datei: ${fileName}\n` +
    `📅 Bezahlt am: ${new Date().toLocaleDateString('de-DE')}\n` +
    `⏰ Zeit: ${new Date().toLocaleTimeString('de-DE')}\n\n` +
    `Status: Abgeschlossen ✓`
  );
  
  // Aufräumen
  if (invoice) {
    invoiceData.delete(invoiceId);
    // Aktive Erinnerungen löschen
    for (let [reminderId, reminder] of reminders) {
      if (reminder.invoiceId === invoiceId) {
        reminders.delete(reminderId);
      }
    }
  }
});

// Problem Button Handler
bot.action(/^problem_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Problem markiert! ❌');
  
  const invoice = invoiceData.get(invoiceId);
  const fileName = invoice ? invoice.fileName : invoiceId;
  
  await ctx.editMessageText(
    `❌ Problem mit Rechnung\n\n` +
    `📄 Datei: ${fileName}\n` +
    `⚠️ Status: Problemfall - manuelle Bearbeitung erforderlich\n` +
    `📅 Gemeldet am: ${new Date().toLocaleDateString('de-DE')}\n\n` +
    `Bitte manuell prüfen und bearbeiten.`
  );
});

// Erinnerung setzen - Wochenkalender
bot.action(/^reminder_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const weekCalendar = createWeekCalendar(invoiceId);
  ctx.reply('⏰ Erinnerung setzen\n\nWähle den Tag:', weekCalendar);
});

// 7-Tage Kalender erstellen
function createWeekCalendar(invoiceId) {
  const today = new Date();
  const weekDays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  
  const buttons = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    const dayName = weekDays[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const dateStr = date.toISOString().split('T');
    
    let buttonText;
    if (i === 0) buttonText = `📅 Heute (${day}. ${month})`;
    else if (i === 1) buttonText = `📅 Morgen (${day}. ${month})`;
    else buttonText = `📅 ${dayName} ${day}. ${month}`;
    
    buttons.push([
      Markup.button.callback(buttonText, `date_${invoiceId}_${dateStr}`)
    ]);
  }
  
  return Markup.inlineKeyboard(buttons);
}

// Datum gewählt - Uhrzeiten anzeigen
bot.action(/^date_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match;
  
  await ctx.answerCbQuery();
  
  const timeKeyboard = createTimeSelection(invoiceId, selectedDate);
  const dateObj = new Date(selectedDate);
  const formattedDate = dateObj.toLocaleDateString('de-DE');
  
  ctx.editMessageText(
    `⏰ Erinnerung setzen\n\n📅 Datum: ${formattedDate}\n\nWähle die Zeit:`,
    timeKeyboard
  );
});

// 14 Uhrzeiten erstellen (9-22 Uhr)
function createTimeSelection(invoiceId, selectedDate) {
  const times = [
    '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', 
    '17:00', '18:00', '19:00', '20:00', 
    '21:00', '22:00'
  ];
  
  const timeButtons = times.map(time => [
    Markup.button.callback(`🕐 ${time}`, `time_${invoiceId}_${selectedDate}_${time}`)
  ]);
  
  // Zurück-Button
  timeButtons.push([
    Markup.button.callback('🔙 Zurück zur Datumsauswahl', `reminder_${invoiceId}`)
  ]);
  
  return Markup.inlineKeyboard(timeButtons);
}

// Zeit gewählt - Erinnerung speichern und Timer setzen
bot.action(/^time_(.+)_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  const selectedTime = ctx.match;
  
  await ctx.answerCbQuery('Erinnerung gesetzt! ⏰');
  
  try {
    const [hours, minutes] = selectedTime.split(':');
    const reminderDate = new Date(selectedDate);
    reminderDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    const timeUntilReminder = reminderDate.getTime() - Date.now();
    
    if (timeUntilReminder > 0) {
      // Timer setzen
      const reminderId = `${invoiceId}_${Date.now()}`;
      reminders.set(reminderId, {
        invoiceId: invoiceId,
        chatId: ctx.chat.id,
        reminderDate: reminderDate
      });
      
      setTimeout(() => {
        sendReminderNotification(ctx.telegram, ctx.chat.id, invoiceId, reminderDate);
        reminders.delete(reminderId);
      }, timeUntilReminder);
      
      console.log(`⏰ Erinnerung gesetzt für ${invoiceId} in ${Math.round(timeUntilReminder / 1000 / 60)} Minuten`);
    }
    
    const formattedDate = reminderDate.toLocaleDateString('de-DE');
    const formattedTime = reminderDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    
    ctx.editMessageText(
      `✅ Erinnerung gesetzt\n\n` +
      `📄 Rechnung: ${invoiceData.get(invoiceId)?.fileName || invoiceId}\n` +
      `⏰ Erinnerung: ${formattedDate} um ${formattedTime}\n\n` +
      `Du wirst zur gewählten Zeit erinnert! 🔔`
    );
    
  } catch (error) {
    console.error('Fehler beim Setzen der Erinnerung:', error);
    ctx.reply('❌ Fehler beim Speichern der Erinnerung. Bitte versuche es erneut.');
  }
});

// Erinnerungs-Benachrichtigung senden
function sendReminderNotification(telegram, chatId, invoiceId, reminderDate) {
  const invoice = invoiceData.get(invoiceId);
  const fileName = invoice ? invoice.fileName : `Rechnung ${invoiceId}`;
  
  const formattedDate = reminderDate.toLocaleDateString('de-DE');
  const formattedTime = reminderDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Jetzt bezahlt', `paid_${invoiceId}`),
      Markup.button.callback('⏰ Neue Erinnerung', `reminder_${invoiceId}`)
    ],
    [
      Markup.button.callback('🕐 In 2 Stunden erinnern', `snooze_${invoiceId}`)
    ]
  ]);
  
  telegram.sendMessage(chatId,
    `🔔 ERINNERUNG\n\n` +
    `⚠️ Rechnung noch nicht bezahlt!\n\n` +
    `📄 Datei: ${fileName}\n` +
    `📅 Erinnerung für: ${formattedDate} ${formattedTime}\n\n` +
    `Was möchtest du tun?`,
    buttons
  );
  
  console.log(`🔔 Erinnerung für ${invoiceId} gesendet`);
}

// Snooze-Funktion (2 Stunden später)
bot.action(/^snooze_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('In 2 Stunden wird erinnert! ⏰');
  
  const snoozeTime = new Date();
  snoozeTime.setHours(snoozeTime.getHours() + 2);
  
  setTimeout(() => {
    sendReminderNotification(ctx.telegram, ctx.chat.id, invoiceId, snoozeTime);
  }, 2 * 60 * 60 * 1000); // 2 Stunden
  
  const formattedTime = snoozeTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  ctx.editMessageText(
    `⏰ Erinnerung verschoben\n\n` +
    `🧾 Rechnung: ${invoiceId}\n` +
    `🕐 Nächste Erinnerung: ${formattedTime}\n\n` +
    `Du wirst in 2 Stunden erneut erinnert! 🔔`
  );
});

// Standard-Kommandos
bot.start((ctx) => {
  ctx.reply(
    `🤖 A&A Backoffice Bot gestartet!\n\n` +
    `📋 Verfügbare Kommandos:\n` +
    `/rechnung - Test-Rechnung erstellen\n` +
    `/status - Bot-Status anzeigen\n\n` +
    `✅ Bereit für automatische Rechnungsverarbeitung!`
  );
});

bot.command('status', (ctx) => {
  const activeInvoices = invoiceData.size;
  const activeReminders = reminders.size;
  
  ctx.reply(
    `📊 Bot Status\n\n` +
    `📄 Aktive Rechnungen: ${activeInvoices}\n` +
    `⏰ Aktive Erinnerungen: ${activeReminders}\n` +
    `🤖 Bot läuft seit: ${new Date().toLocaleString('de-DE')}\n` +
    `🟢 Status: Online ✅`
  );
});

// Error Handler
bot.catch((err, ctx) => {
  console.error('Bot Fehler:', err);
});

// Bot starten
console.log('🔄 Bot Launch wird gestartet...');
bot.launch().then(() => {
  console.log('✅ A&A BACKOFFICE BOT LÄUFT PERFEKT!');
}).catch((error) => {
  console.error('❌ Launch Fehler:', error);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('📡 Setup komplett - Bot ist einsatzbereit!');




