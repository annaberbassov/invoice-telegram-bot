const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// *** HTTP SERVER HINZUFÜGEN FÜR RENDER COMPATIBILITY ***
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Telegram Bot is running! 🤖\n');
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP Server läuft auf Port ${PORT}`);
});

// *** DEIN BESTEHENDER BOT CODE MIT FIXES ***
// Gespeicherte Erinnerungen
const reminders = new Map();

// Test-Rechnung erstellen
bot.command('rechnung', (ctx) => {
  const invoiceId = Date.now();
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Bezahlt', `paid_${invoiceId}`),
      Markup.button.callback('⏰ Erinnerung setzen', `reminder_${invoiceId}`)
    ]
  ]);
  
  ctx.reply(
    `📧 *Neue Rechnung eingegangen*\n\n` +
    `🧾 Nummer: *#${invoiceId}*\n` +
    `💰 Betrag: *€250.00*\n` +
    `👤 Kunde: *Test Kunde*\n\n` +
    `Bitte Aktion wählen:`,
    { ...buttons, parse_mode: 'Markdown' }
  );
});

// Echte Rechnung (für Apps Script Integration) - VERBESSERT
bot.command('newInvoice', (ctx) => {
  const fullText = ctx.message.text;
  
  // Parse die strukturierten Daten
  const parts = fullText.match(/"([^"]+)"/g);
  
  if (parts && parts.length >= 6) {
    const fileName = parts.replace(/"/g, '');
    const invoiceType = parts[1].replace(/"/g, '');
    const project = parts.replace(/"/g, '');
    const date = parts.replace(/"/g, '');
    const fileId = parts.replace(/"/g, '');
    const driveUrl = parts.replace(/"/g, '');
    
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('💸 Bezahlt', `paid_${fileId}`),
        Markup.button.callback('⏰ Erinnerung setzen', `reminder_${fileId}`)
      ],
      [
        Markup.button.callback('📁 Drive öffnen', `drive_${fileId}`)
      ]
    ]);
    
    ctx.reply(
      `📧 *Neue Rechnung eingegangen*\n\n` +
      `📄 *Datei:* ${fileName}\n` +
      `💰 *Typ:* ${invoiceType}\n` +
      `🏢 *Projekt:* ${project}\n` +
      `📅 *Datum:* ${date}\n` +
      `🔗 *Drive-Link:* [Datei öffnen](${driveUrl})\n\n` +
      `Bitte Aktion wählen:`,
      { ...buttons, parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  } else {
    // Fallback für alte Version
    const args = ctx.message.text.split(' ');
    const invoiceNumber = args[1] || Date.now();
    const amount = args || '0.00';
    const customer = args || 'Kunde';
    
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('💸 Bezahlt', `paid_${invoiceNumber}`),
        Markup.button.callback('⏰ Erinnerung setzen', `reminder_${invoiceNumber}`)
      ]
    ]);
    
    ctx.reply(
      `📧 *Neue Rechnung eingegangen*\n\n` +
      `🧾 Nummer: *${invoiceNumber}*\n` +
      `💰 Betrag: *€${amount}*\n` +
      `👤 Kunde: *${customer}*\n\n` +
      `Bitte Aktion wählen:`,
      { ...buttons, parse_mode: 'Markdown' }
    );
  }
});


// Bezahlt-Button
bot.action(/^paid_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Rechnung als bezahlt markiert! ✅');
  
  await ctx.editMessageText(
    `✅ *Rechnung bezahlt*\n\n` +
    `🧾 Nummer: *${invoiceId}*\n` +
    `📅 Bezahlt am: *${new Date().toLocaleDateString('de-DE')}*\n` +
    `⏰ Zeit: *${new Date().toLocaleTimeString('de-DE')}*`,
    { parse_mode: 'Markdown' }
  );
});

// Erinnerung setzen - Wochenkalender anzeigen
bot.action(/^reminder_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const weekCalendar = createWeekCalendar(invoiceId);
  
  await ctx.reply(
    `⏰ *Erinnerung für Rechnung #${invoiceId}*\n\n` +
    `📅 Wähle den Tag (nächste 7 Tage):`,
    { ...weekCalendar, parse_mode: 'Markdown' }
  );
});

// Wochenkalender erstellen (nächste 7 Tage) - VERBESSERT
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
    
    // FIX: ISO Format für eindeutige Datumswerte
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

// Datum ausgewählt - Uhrzeit wählen - KOMPLETT ÜBERARBEITET
bot.action(/^date_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  let selectedDate = ctx.match[2];
  
  await ctx.answerCbQuery();
  
  // Fix für "heute" und "morgen" (falls noch verwendet)
  const today = new Date();
  if (selectedDate === 'heute') {
    selectedDate = today.toISOString().split('T')[0];
  } else if (selectedDate === 'morgen') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    selectedDate = tomorrow.toISOString().split('T')[0];
  }
  
  const timeButtons = createTimeSelection(invoiceId, selectedDate);
  
  // Sichere Datumsformatierung
  try {
    const dateObj = new Date(selectedDate + 'T12:00:00.000Z');
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      timeZone: 'Europe/Berlin'
    });
    
    await ctx.editMessageText(
      `⏰ *Erinnerung für Rechnung #${invoiceId}*\n\n` +
      `📅 Datum: *${formattedDate}*\n\n` +
      `🕐 Wähle die Uhrzeit:`,
      { ...timeButtons, parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.log('Datumsfehler:', error);
    await ctx.editMessageText(
      `⏰ *Erinnerung für Rechnung #${invoiceId}*\n\n` +
      `📅 Datum: *${selectedDate}*\n\n` +
      `🕐 Wähle die Uhrzeit:`,
      { ...timeButtons, parse_mode: 'Markdown' }
    );
  }
});

// Uhrzeiten-Auswahl erstellen
function createTimeSelection(invoiceId, selectedDate) {
  const times = ['09:00', '10:00', '11:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
  
  const timeButtons = times.map(time => [
    Markup.button.callback(`🕐 ${time} Uhr`, `time_${invoiceId}_${selectedDate}_${time}`)
  ]);
  
  // Zurück-Button hinzufügen
  timeButtons.push([
    Markup.button.callback('🔙 Zurück zur Datumsauswahl', `reminder_${invoiceId}`)
  ]);
  
  return Markup.inlineKeyboard(timeButtons);
}

// Uhrzeit ausgewählt - Erinnerung speichern - VERBESSERT
bot.action(/^time_(.+)_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  const selectedTime = ctx.match[3];
  
  await ctx.answerCbQuery('Erinnerung gespeichert! ⏰');
  
  // Sichere Erinnerungsdatum-Berechnung
  try {
    const [hours, minutes] = selectedTime.split(':');
    const reminderDateTime = new Date(selectedDate + 'T00:00:00.000Z');
    reminderDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // Erinnerung planen und Timer setzen
    scheduleReminder(ctx, invoiceId, reminderDateTime);
    
    const formattedDate = reminderDateTime.toLocaleDateString('de-DE');
    const formattedTime = reminderDateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    
    await ctx.editMessageText(
      `✅ *Erinnerung gespeichert*\n\n` +
      `🧾 Rechnung: *#${invoiceId}*\n` +
      `📅 Datum: *${formattedDate}*\n` +
      `⏰ Zeit: *${formattedTime}*\n\n` +
      `Du wirst zur gewählten Zeit erinnert! 🔔`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.log('Erinnerungsfehler:', error);
    await ctx.editMessageText(
      `❌ *Fehler beim Speichern der Erinnerung*\n\n` +
      `Bitte versuche es erneut.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Erinnerung planen und Timer setzen
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

// Erinnerung senden mit "2 Stunden später" Option
function sendReminder(telegram, chatId, invoiceId, reminderDateTime) {
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
    `🧾 Rechnungsnummer: *#${invoiceId}*\n` +
    `📅 Erinnerung für: *${formattedDate} ${formattedTime}*\n\n` +
    `Was möchtest du tun?`,
    { ...buttons, parse_mode: 'Markdown' }
  );
}

// "In 2 Stunden erinnern" Button
bot.action(/^snooze_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('In 2 Stunden wird erinnert! ⏰');
  
  // 2 Stunden später erinnern
  const snoozeTime = new Date();
  snoozeTime.setHours(snoozeTime.getHours() + 2);
  
  setTimeout(() => {
    sendReminder(ctx.telegram, ctx.chat.id, invoiceId, snoozeTime);
  }, 2 * 60 * 60 * 1000); // 2 Stunden in Millisekunden
  
  await ctx.editMessageText(
    `⏰ *Erinnerung verschoben*\n\n` +
    `🧾 Rechnung: *#${invoiceId}*\n` +
    `🕐 Nächste Erinnerung: *${snoozeTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr*\n\n` +
    `Du wirst in 2 Stunden erneut erinnert! 🔔`,
    { parse_mode: 'Markdown' }
  );
});

// Aktive Erinnerungen anzeigen
bot.command('erinnerungen', (ctx) => {
  const userReminders = Array.from(reminders.entries())
    .filter(([id, reminder]) => reminder.chatId === ctx.chat.id);
  
  if (userReminders.length === 0) {
    ctx.reply('📭 Keine aktiven Erinnerungen vorhanden.');
    return;
  }
  
  const reminderList = userReminders.map(([id, reminder]) => {
    const formattedDate = reminder.reminderDateTime.toLocaleDateString('de-DE');
    const formattedTime = reminder.reminderDateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `🧾 Rechnung #${reminder.invoiceId}\n📅 ${formattedDate} um ${formattedTime}`;
  });
  
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
