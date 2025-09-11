const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Gespeicherte Erinnerungen (in Produktion würdest du eine Datenbank nutzen)
const reminders = new Map();

// Neue Rechnung empfangen (für Integration mit Apps Script)
bot.command('newInvoice', (ctx) => {
  const args = ctx.message.text.split(' ');
  const invoiceNumber = args[1] || Date.now();
  const amount = args[2] || '0.00';
  const customer = args[3] || 'Kunde';
  
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Bezahlt', `paid_${invoiceNumber}`),
      Markup.button.callback('⏰ Erinnerung setzen', `reminder_${invoiceNumber}`)
    ]
  ]);
  
  ctx.reply(
    `📧 *Neue Rechnung eingegangen*\n\n` +
    `🧾 Rechnungsnummer: *${invoiceNumber}*\n` +
    `💰 Betrag: *€${amount}*\n` +
    `👤 Kunde: *${customer}*\n\n` +
    `Bitte Aktion wählen:`,
    { ...buttons, parse_mode: 'Markdown' }
  );
});

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
    `📧 *Test-Rechnung eingegangen*\n\n` +
    `🧾 Rechnungsnummer: *${invoiceId}*\n` +
    `💰 Betrag: *€250.00*\n` +
    `👤 Kunde: *Test Kunde*\n\n` +
    `Bitte Aktion wählen:`,
    { ...buttons, parse_mode: 'Markdown' }
  );
});

// Bezahlt-Button verarbeiten
bot.action(/^paid_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Rechnung als bezahlt markiert! ✅');
  
  await ctx.editMessageText(
    `✅ *Rechnung bezahlt*\n\n` +
    `🧾 Rechnungsnummer: *${invoiceId}*\n` +
    `📅 Bezahlt am: *${new Date().toLocaleDateString('de-DE')}*\n` +
    `⏰ Zeit: *${new Date().toLocaleTimeString('de-DE')}*`,
    { parse_mode: 'Markdown' }
  );
});

// Erinnerung setzen - Kalender anzeigen
bot.action(/^reminder_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const calendarButtons = createCalendar(invoiceId);
  
  await ctx.reply(
    `⏰ *Erinnerung für Rechnung #${invoiceId}*\n\n` +
    `📅 Wähle das Datum für die Erinnerung:`,
    { ...calendarButtons, parse_mode: 'Markdown' }
  );
});

// Kalender erstellen
function createCalendar(invoiceId) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  const monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];
  
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  
  const keyboard = [];
  
  // Monat/Jahr Header
  keyboard.push([
    Markup.button.callback(`📅 ${monthNames[currentMonth]} ${currentYear}`, 'ignore')
  ]);
  
  // Wochentage
  keyboard.push([
    Markup.button.callback('Mo', 'ignore'),
    Markup.button.callback('Di', 'ignore'),
    Markup.button.callback('Mi', 'ignore'),
    Markup.button.callback('Do', 'ignore'),
    Markup.button.callback('Fr', 'ignore'),
    Markup.button.callback('Sa', 'ignore'),
    Markup.button.callback('So', 'ignore')
  ]);
  
  // Tage des Monats
  let week = [];
  
  // Leere Zellen für den Anfang
  for (let i = 0; i < firstDay; i++) {
    week.push(Markup.button.callback(' ', 'ignore'));
  }
  
  // Tage hinzufügen
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = day === today.getDate();
    const isPast = day < today.getDate();
    
    if (isPast) {
      week.push(Markup.button.callback(`${day}`, 'ignore'));
    } else {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const buttonText = isToday ? `[${day}]` : `${day}`;
      week.push(Markup.button.callback(buttonText, `date_${invoiceId}_${dateStr}`));
    }
    
    if (week.length === 7) {
      keyboard.push([...week]);
      week = [];
    }
  }
  
  // Letzte unvollständige Woche
  if (week.length > 0) {
    while (week.length < 7) {
      week.push(Markup.button.callback(' ', 'ignore'));
    }
    keyboard.push(week);
  }
  
  // Schnell-Auswahl Buttons
  keyboard.push([
    Markup.button.callback('📅 Heute', `date_${invoiceId}_heute`),
    Markup.button.callback('📅 Morgen', `date_${invoiceId}_morgen`)
  ]);
  
  return Markup.inlineKeyboard(keyboard);
}

// Datum ausgewählt - Uhrzeit wählen
bot.action(/^date_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  let selectedDate = ctx.match[2];
  
  // Spezielle Datumsbehandlung
  const today = new Date();
  if (selectedDate === 'heute') {
    selectedDate = today.toISOString().split('T')[0];
  } else if (selectedDate === 'morgen') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    selectedDate = tomorrow.toISOString().split('T')[0];
  }
  
  await ctx.answerCbQuery();
  
  const timeButtons = createTimeSelection(invoiceId, selectedDate);
  const formattedDate = new Date(selectedDate).toLocaleDateString('de-DE');
  
  await ctx.editMessageText(
    `⏰ *Erinnerung für Rechnung #${invoiceId}*\n\n` +
    `📅 Datum: *${formattedDate}*\n\n` +
    `🕐 Wähle die Uhrzeit:`,
    { ...timeButtons, parse_mode: 'Markdown' }
  );
});

// Uhrzeiten-Auswahl erstellen
function createTimeSelection(invoiceId, selectedDate) {
  const timeSlots = [
    ['09:00', '10:00', '11:00'],
    ['12:00', '13:00', '14:00'],
    ['15:00', '16:00', '17:00'],
    ['18:00', '19:00', '20:00']
  ];
  
  const keyboard = timeSlots.map(row => 
    row.map(time => 
      Markup.button.callback(`🕐 ${time}`, `time_${invoiceId}_${selectedDate}_${time}`)
    )
  );
  
  // Zurück-Button
  keyboard.push([
    Markup.button.callback('🔙 Zurück zum Kalender', `reminder_${invoiceId}`)
  ]);
  
  return Markup.inlineKeyboard(keyboard);
}

// Uhrzeit ausgewählt - Erinnerung speichern
bot.action(/^time_(.+)_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  const selectedTime = ctx.match[3];
  
  await ctx.answerCbQuery('Erinnerung gespeichert! ⏰');
  
  // Erinnerungsdatum berechnen
  const [hours, minutes] = selectedTime.split(':');
  const reminderDateTime = new Date(selectedDate);
  reminderDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  // Erinnerung speichern
  const reminderId = `${invoiceId}_${Date.now()}`;
  reminders.set(reminderId, {
    invoiceId,
    chatId: ctx.chat.id,
    reminderDateTime,
    created: new Date()
  });
  
  // Timeout für Erinnerung setzen
  const timeUntilReminder = reminderDateTime.getTime() - Date.now();
  if (timeUntilReminder > 0) {
    setTimeout(() => {
      sendReminder(ctx.telegram, ctx.chat.id, invoiceId, reminderDateTime);
      reminders.delete(reminderId);
    }, timeUntilReminder);
  }
  
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
});

// Erinnerung senden
function sendReminder(telegram, chatId, invoiceId, reminderDateTime) {
  const formattedDate = reminderDateTime.toLocaleDateString('de-DE');
  const formattedTime = reminderDateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Jetzt bezahlt', `paid_${invoiceId}`),
      Markup.button.callback('⏰ Neue Erinnerung', `reminder_${invoiceId}`)
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

// Gespeicherte Erinnerungen anzeigen
bot.command('erinnerungen', (ctx) => {
  const userReminders = Array.from(reminders.entries())
    .filter(([id, reminder]) => reminder.chatId === ctx.chat.id)
    .map(([id, reminder]) => {
      const formattedDate = reminder.reminderDateTime.toLocaleDateString('de-DE');
      const formattedTime = reminder.reminderDateTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      return `🧾 Rechnung #${reminder.invoiceId}\n📅 ${formattedDate} um ${formattedTime}`;
    });
  
  if (userReminders.length === 0) {
    ctx.reply('📭 Keine aktiven Erinnerungen vorhanden.');
    return;
  }
  
  ctx.reply(
    `⏰ *Deine aktiven Erinnerungen:*\n\n${userReminders.join('\n\n')}`,
    { parse_mode: 'Markdown' }
  );
});

// Ignore Handler für nicht-klickbare Buttons
bot.action('ignore', async (ctx) => {
  await ctx.answerCbQuery();
});

// Bot-Start
bot.start((ctx) => {
  ctx.reply(
    `🤖 *Rechnungs-Bot gestartet!*\n\n` +
    `📋 Verfügbare Kommandos:\n` +
    `/rechnung - Test-Rechnung erstellen\n` +
    `/erinnerungen - Aktive Erinnerungen anzeigen\n\n` +
    `💡 Für echte Rechnungen nutze /newInvoice [Nummer] [Betrag] [Kunde]`,
    { parse_mode: 'Markdown' }
  );
});

bot.launch();

console.log('🤖 Telegram Rechnungs-Bot mit Kalender gestartet!');

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
