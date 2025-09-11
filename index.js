const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// HTTP Server für Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Telegram Bot is running! 🤖\n');
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP Server läuft auf Port ${PORT}`);
});

// Gespeicherte Erinnerungen und Rechnungsdaten  
const reminders = new Map();
const invoiceData = new Map(); // Speichert PDF-Infos

// Test-Rechnung erstellen
bot.command('rechnung', (ctx) => {
  const invoiceId = `TEST-${Date.now()}`;
  const testInvoice = {
    id: invoiceId,
    fileName: 'test_rechnung_2025_09_11.pdf',
    type: 'rechnung',
    project: 'Test Projekt',
    date: '2025_09_11',
    driveUrl: 'https://drive.google.com/file/d/test123/view',
    reminderSet: false,
    reminderTime: null
  };
  
  invoiceData.set(invoiceId, testInvoice);
  sendInvoiceMessage(ctx, testInvoice);
});

// Echte Rechnung von Apps Script - NEUE VERSION
bot.command('newInvoice', (ctx) => {
  const fullText = ctx.message.text;
  const parts = fullText.match(/"([^"]+)"/g);
  
  if (parts && parts.length >= 6) {
    const fileName = parts[0].replace(/"/g, '');
    const invoiceType = parts[1].replace(/"/g, '');
    const project = parts[2].replace(/"/g, '');
    const date = parts[3].replace(/"/g, '');
    const fileId = parts[4].replace(/"/g, '');
    const driveUrl = parts[5].replace(/"/g, '');
    
    const invoice = {
      id: fileId,
      fileName: fileName,
      type: invoiceType,
      project: project,
      date: date,
      driveUrl: driveUrl,
      reminderSet: false,
      reminderTime: null
    };
    
    invoiceData.set(fileId, invoice);
    sendInvoiceMessage(ctx, invoice);
  } else {
    // Fallback für alte Version
    const args = ctx.message.text.split(' ');
    const invoiceNumber = args[1] || Date.now();
    const amount = args[2] || '0.00';
    const customer = args[3] || 'Kunde';
    
    const testInvoice = {
      id: invoiceNumber,
      fileName: `Rechnung_${invoiceNumber}`,
      type: 'rechnung',
      project: customer,
      date: new Date().toISOString().split('T')[0],
      driveUrl: 'https://drive.google.com',
      reminderSet: false,
      reminderTime: null
    };
    
    invoiceData.set(invoiceNumber, testInvoice);
    sendInvoiceMessage(ctx, testInvoice);
  }
});

// EINE einzige Rechnungs-Nachricht senden/updaten
function sendInvoiceMessage(ctx, invoice, messageId = null) {
  const shortName = invoice.fileName.length > 40 ? 
                   invoice.fileName.substring(0, 37) + '...' : 
                   invoice.fileName;
  
  let text = `📧 *Neue Rechnung eingegangen*\n\n` +
             `📄 *Datei:* ${shortName}\n` +
             `💰 *Typ:* ${invoice.type}\n` +
             `🏢 *Projekt:* ${invoice.project}\n` +
             `📅 *Datum:* ${invoice.date}\n` +
             `🔗 [📁 Drive-Link](${invoice.driveUrl})\n\n`;
  
  // Erinnerung-Status hinzufügen
  if (invoice.reminderSet && invoice.reminderTime) {
    text += `⏰ *Erinnerung gesetzt:* ${invoice.reminderTime}\n\n`;
  }
  
  text += `Bitte Aktion wählen:`;
  
  // Dynamische Buttons
  const buttons = [];
  buttons.push([
    Markup.button.callback('💸 Bezahlt', `paid_${invoice.id}`),
    Markup.button.callback('❌ Problem', `problem_${invoice.id}`)
  ]);
  
  if (invoice.reminderSet) {
    buttons.push([
      Markup.button.callback(`⏰ Erinnerung: ${invoice.reminderTime}`, `change_reminder_${invoice.id}`)
    ]);
  } else {
    buttons.push([
      Markup.button.callback('⏰ Erinnerung setzen', `reminder_${invoice.id}`)
    ]);
  }
  
  const keyboard = Markup.inlineKeyboard(buttons);
  
  if (messageId) {
    // Nachricht updaten
    ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, {
      ...keyboard, 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    }).catch(() => {
      // Fallback falls Edit nicht funktioniert
      ctx.reply(text, {
        ...keyboard, 
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    });
  } else {
    // Neue Nachricht senden
    ctx.reply(text, {
      ...keyboard, 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }
}

// Bezahlt-Button
bot.action(/^paid_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Rechnung als bezahlt markiert! ✅');
  
  const invoice = invoiceData.get(invoiceId);
  if (invoice) {
    await ctx.editMessageText(
      `✅ *Rechnung bezahlt*\n\n` +
      `📄 *Datei:* ${invoice.fileName}\n` +
      `📅 *Bezahlt am:* ${new Date().toLocaleDateString('de-DE')}\n` +
      `⏰ *Zeit:* ${new Date().toLocaleTimeString('de-DE')}`,
      { parse_mode: 'Markdown' }
    );
    invoiceData.delete(invoiceId);
    
    // Erinnerung löschen falls vorhanden
    for (let [reminderId, reminder] of reminders) {
      if (reminder.invoiceId === invoiceId) {
        reminders.delete(reminderId);
      }
    }
  }
});

// Problem-Button
bot.action(/^problem_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Problem markiert! ❌');
  
  const invoice = invoiceData.get(invoiceId);
  if (invoice) {
    await ctx.editMessageText(
      `❌ *Problem mit Rechnung*\n\n` +
      `📄 *Datei:* ${invoice.fileName}\n` +
      `⚠️ *Status:* Problemfall - manuelle Bearbeitung erforderlich\n` +
      `📅 *Gemeldet am:* ${new Date().toLocaleDateString('de-DE')}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Erinnerung setzen - Kalender anzeigen
bot.action(/^reminder_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const weekCalendar = createWeekCalendar(invoiceId);
  
  await ctx.reply(
    `⏰ *Erinnerung für Rechnung*\n\n` +
    `📅 Wähle den Tag (nächste 7 Tage):`,
    { ...weekCalendar, parse_mode: 'Markdown' }
  );
});

// Erinnerung ändern
bot.action(/^change_reminder_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const weekCalendar = createWeekCalendar(invoiceId);
  
  await ctx.reply(
    `⏰ *Erinnerung ändern*\n\n` +
    `📅 Wähle neuen Tag:`,
    { ...weekCalendar, parse_mode: 'Markdown' }
  );
});

// Wochenkalender erstellen
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
    const dateStr = date.toISOString().split('T')[0];
    
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

// Datum ausgewählt - Uhrzeit wählen
bot.action(/^date_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  
  await ctx.answerCbQuery();
  
  const timeButtons = createTimeSelection(invoiceId, selectedDate);
  const dateObj = new Date(selectedDate + 'T12:00:00.000Z');
  const formattedDate = dateObj.toLocaleDateString('de-DE');
  
  await ctx.editMessageText(
    `⏰ *Erinnerung für Rechnung*\n\n` +
    `📅 *Datum:* ${formattedDate}\n\n` +
    `🕐 Wähle die Uhrzeit:`,
    { ...timeButtons, parse_mode: 'Markdown' }
  );
});

// Uhrzeiten-Auswahl erstellen
function createTimeSelection(invoiceId, selectedDate) {
  const times = ['09:00', '10:00', '11:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
  
  const timeButtons = times.map(time => [
    Markup.button.callback(`🕐 ${time} Uhr`, `time_${invoiceId}_${selectedDate}_${time}`)
  ]);
  
  timeButtons.push([
    Markup.button.callback('🔙 Zurück zur Datumsauswahl', `reminder_${invoiceId}`)
  ]);
  
  return Markup.inlineKeyboard(timeButtons);
}

// Uhrzeit ausgewählt - Erinnerung speichern
bot.action(/^time_(.+)_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  const selectedTime = ctx.match[3];
  
  await ctx.answerCbQuery('Erinnerung gespeichert! ⏰');
  
  try {
    const [hours, minutes] = selectedTime.split(':');
    const reminderDateTime = new Date(selectedDate + 'T00:00:00.000Z');
    reminderDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    const formattedDate = reminderDateTime.toLocaleDateString('de-DE');
    const formattedTime = reminderDateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const displayTime = `${formattedDate} ${formattedTime}`;
    
    // Invoice-Daten updaten
    const invoice = invoiceData.get(invoiceId);
    if (invoice) {
      invoice.reminderSet = true;
      invoice.reminderTime = displayTime;
      invoiceData.set(invoiceId, invoice);
    }
    
    // Timer setzen
    scheduleReminder(ctx, invoiceId, reminderDateTime);
    
    // Kalender-Nachricht löschen
    await ctx.deleteMessage();
    
    // Bestätigung senden
    await ctx.reply(
      `✅ *Erinnerung gespeichert*\n\n` +
      `📄 *Rechnung:* ${invoice ? invoice.fileName : invoiceId}\n` +
      `⏰ *Erinnerung:* ${displayTime}\n\n` +
      `Der Button in der ursprünglichen Nachricht zeigt jetzt die Erinnerungszeit an.`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.log('Erinnerungsfehler:', error);
    await ctx.reply('❌ Fehler beim Speichern der Erinnerung.');
  }
});

// Timer-Funktion
function scheduleReminder(ctx, invoiceId, reminderDateTime) {
  const timeUntilReminder = reminderDateTime.getTime() - Date.now();
  
  console.log(`Erinnerung für ${invoiceId} in ${Math.round(timeUntilReminder / 1000 / 60)} Minuten`);
  
  if (timeUntilReminder > 0) {
    const reminderId = `${invoiceId}_${Date.now()}`;
    reminders.set(reminderId, { invoiceId, chatId: ctx.chat.id, reminderDateTime });
    
    setTimeout(() => {
      sendReminder(ctx.telegram, ctx.chat.id, invoiceId, reminderDateTime);
      reminders.delete(reminderId);
    }, timeUntilReminder);
  } else {
    console.log('Erinnerungszeit liegt in der Vergangenheit');
  }
}

// Erinnerung senden
function sendReminder(telegram, chatId, invoiceId, reminderDateTime) {
  const invoice = invoiceData.get(invoiceId);
  const fileName = invoice ? invoice.fileName : `Rechnung #${invoiceId}`;
  
  const formattedDate = reminderDateTime.toLocaleDateString('de-DE');
  const formattedTime = reminderDateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Jetzt bezahlt', `paid_${invoiceId}`),
      Markup.button.callback('⏰ Neue Erinnerung', `reminder_${invoiceId}`)
    ],
    [
      Markup.button.callback('🕐 In 2 Stunden erinnern', `snooze_${invoiceId}`)
    ],
    [
      Markup.button.callback('🔕 Ignorieren', 'ignore')
    ]
  ]);
  
  telegram.sendMessage(chatId,
    `🔔 *ERINNERUNG*\n\n` +
    `⚠️ Rechnung noch nicht bezahlt!\n\n` +
    `📄 *Datei:* ${fileName}\n` +
    `📅 *Erinnerung für:* ${formattedDate} ${formattedTime}\n\n` +
    `Was möchtest du tun?`,
    { ...buttons, parse_mode: 'Markdown' }
  );
}

// Snooze-Funktion
bot.action(/^snooze_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('In 2 Stunden wird erinnert! ⏰');
  
  const snoozeTime = new Date();
  snoozeTime.setHours(snoozeTime.getHours() + 2);
  
  setTimeout(() => {
    sendReminder(ctx.telegram, ctx.chat.id, invoiceId, snoozeTime);
  }, 2 * 60 * 60 * 1000);
  
  await ctx.editMessageText(
    `⏰ *Erinnerung verschoben*\n\n` +
    `🕐 *Nächste Erinnerung:* ${snoozeTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr\n\n` +
    `Du wirst in 2 Stunden erneut erinnert! 🔔`,
    { parse_mode: 'Markdown' }
  );
});

// Ignore Handler
bot.action('ignore', async (ctx) => {
  await ctx.answerCbQuery('Erinnerung ignoriert');
  await ctx.editMessageText('🔕 Erinnerung wurde ignoriert.');
});

// Bot Start
bot.start((ctx) => {
  ctx.reply(
    `🤖 *Rechnungs-Bot gestartet!*\n\n` +
    `📋 Verfügbare Kommandos:\n` +
    `/rechnung - Test-Rechnung erstellen\n\n` +
    `💡 Der Bot ist bereit für deine Rechnungen!`,
    { parse_mode: 'Markdown' }
  );
});

bot.launch();

console.log('🤖 Telegram Rechnungs-Bot mit optimierter UI gestartet!');
console.log(`🌐 HTTP Server läuft auf Port ${PORT}`);

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

  
  ctx.reply(
    `⏰ *Deine aktiven Erinnerungen:*\n\n${reminderList.join('\n\n')}`,
    { parse_mode: 'Markdown' }
  );
});

// Ignore Handler
bot.action('ignore', async (ctx) => {
  await ctx.answerCbQuery('Erinnerung ignoriert');
  await ctx.editMessageText('🔕 Erinnerung wurde ignoriert.');
});

// Bot Start
bot.start((ctx) => {
  ctx.reply(
    `🤖 *Rechnungs-Bot gestartet!*\n\n` +
    `📋 Verfügbare Kommandos:\n` +
    `/rechnung - Test-Rechnung erstellen\n` +
    `/erinnerungen - Aktive Erinnerungen anzeigen\n\n` +
    `💡 Der Bot ist bereit für deine Rechnungen!`,
    { parse_mode: 'Markdown' }
  );
});

bot.launch();

console.log('🤖 Telegram Rechnungs-Bot mit Wochenkalender gestartet!');
console.log(`🌐 HTTP Server läuft auf Port ${PORT}`);

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
