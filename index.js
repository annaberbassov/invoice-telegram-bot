const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// HTTP Server für Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Telegram Bot is running!\n');
});

server.listen(PORT, () => {
  console.log(`HTTP Server on port ${PORT}`);
});

// Gespeicherte Daten
const invoiceData = new Map();
const reminders = new Map();

// Test-Rechnung
bot.command('rechnung', (ctx) => {
  const invoice = {
    id: Date.now(),
    fileName: 'test_rechnung.pdf',
    type: 'rechnung', 
    project: 'Test',
    date: '2025_09_11',
    driveUrl: 'https://drive.google.com'
  };
  
  invoiceData.set(invoice.id, invoice);
  
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Bezahlt', `paid_${invoice.id}`),
      Markup.button.callback('❌ Problem', `problem_${invoice.id}`)
    ],
    [
      Markup.button.callback('⏰ Erinnerung setzen', `reminder_${invoice.id}`)
    ]
  ]);
  
  ctx.reply(
    `📧 *Test-Rechnung*\n\n` +
    `📄 Datei: ${invoice.fileName}\n` +
    `💰 Typ: ${invoice.type}\n` +
    `🏢 Projekt: ${invoice.project}\n` +
    `📅 Datum: ${invoice.date}\n\n` +
    `Aktion wählen:`,
    { ...buttons, parse_mode: 'Markdown' }
  );
});

// Apps Script Integration
bot.command('newInvoice', (ctx) => {
  const text = ctx.message.text;
  const parts = text.match(/"([^"]+)"/g);
  
  if (parts && parts.length >= 6) {
    const invoice = {
      id: parts[4].replace(/"/g, ''),
      fileName: parts[0].replace(/"/g, ''),
      type: parts[1].replace(/"/g, ''),
      project: parts[2].replace(/"/g, ''),
      date: parts[3].replace(/"/g, ''),
      driveUrl: parts[5].replace(/"/g, '')
    };
    
    invoiceData.set(invoice.id, invoice);
    
    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('💸 Bezahlt', `paid_${invoice.id}`),
        Markup.button.callback('❌ Problem', `problem_${invoice.id}`)
      ],
      [
        Markup.button.callback('⏰ Erinnerung setzen', `reminder_${invoice.id}`)
      ]
    ]);
    
    ctx.reply(
      `📧 *Neue Rechnung*\n\n` +
      `📄 Datei: ${invoice.fileName.substring(0, 40)}...\n` +
      `💰 Typ: ${invoice.type}\n` +
      `🏢 Projekt: ${invoice.project}\n` +
      `📅 Datum: ${invoice.date}\n` +
      `🔗 [Drive-Link](${invoice.driveUrl})\n\n` +
      `Aktion wählen:`,
      { ...buttons, parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }
});

// Bezahlt Button
bot.action(/^paid_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Bezahlt markiert!');
  
  const invoice = invoiceData.get(invoiceId);
  await ctx.editMessageText(
    `✅ *Rechnung bezahlt*\n\n` +
    `📄 Datei: ${invoice ? invoice.fileName : invoiceId}\n` +
    `📅 Bezahlt: ${new Date().toLocaleDateString('de-DE')}`,
    { parse_mode: 'Markdown' }
  );
});

// Problem Button  
bot.action(/^problem_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Problem markiert!');
  
  const invoice = invoiceData.get(invoiceId);
  await ctx.editMessageText(
    `❌ *Problem mit Rechnung*\n\n` +
    `📄 Datei: ${invoice ? invoice.fileName : invoiceId}\n` +
    `⚠️ Status: Problemfall`,
    { parse_mode: 'Markdown' }
  );
});

// Erinnerung Button - Kalender
bot.action(/^reminder_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery();
  
  const today = new Date();
  const buttons = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const dateStr = date.toISOString().split('T')[0];
    
    let text;
    if (i === 0) text = `📅 Heute (${day}.${month})`;
    else if (i === 1) text = `📅 Morgen (${day}.${month})`;
    else text = `📅 ${day}.${month}`;
    
    buttons.push([
      Markup.button.callback(text, `date_${invoiceId}_${dateStr}`)
    ]);
  }
  
  const calendar = Markup.inlineKeyboard(buttons);
  
  ctx.reply(
    `⏰ *Erinnerung setzen*\n\nWähle den Tag:`,
    { ...calendar, parse_mode: 'Markdown' }
  );
});

// Datum gewählt - Uhrzeit
bot.action(/^date_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  
  await ctx.answerCbQuery();
  
  const times = ['09:00', '10:00', '11:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
  
  const timeButtons = times.map(time => [
    Markup.button.callback(`🕐 ${time}`, `time_${invoiceId}_${selectedDate}_${time}`)
  ]);
  
  const timeKeyboard = Markup.inlineKeyboard(timeButtons);
  
  const dateObj = new Date(selectedDate);
  const formattedDate = dateObj.toLocaleDateString('de-DE');
  
  ctx.editMessageText(
    `⏰ *Erinnerung setzen*\n\n📅 Datum: ${formattedDate}\n\nWähle die Zeit:`,
    { ...timeKeyboard, parse_mode: 'Markdown' }
  );
});

// Zeit gewählt - Erinnerung speichern
bot.action(/^time_(.+)_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  const selectedTime = ctx.match[3];
  
  await ctx.answerCbQuery('Erinnerung gesetzt!');
  
  const [hours, minutes] = selectedTime.split(':');
  const reminderDate = new Date(selectedDate);
  reminderDate.setHours(parseInt(hours), parseInt(minutes));
  
  const timeUntilReminder = reminderDate.getTime() - Date.now();
  
  if (timeUntilReminder > 0) {
    setTimeout(() => {
      const invoice = invoiceData.get(invoiceId);
      const fileName = invoice ? invoice.fileName : `Rechnung ${invoiceId}`;
      
      ctx.telegram.sendMessage(ctx.chat.id,
        `🔔 *ERINNERUNG*\n\n` +
        `📄 ${fileName}\n\n` +
        `⚠️ Rechnung noch nicht bezahlt!`,
        { parse_mode: 'Markdown' }
      );
    }, timeUntilReminder);
  }
  
  const formattedDate = reminderDate.toLocaleDateString('de-DE');
  const formattedTime = reminderDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  ctx.editMessageText(
    `✅ *Erinnerung gesetzt*\n\n` +
    `📅 ${formattedDate} um ${formattedTime}`,
    { parse_mode: 'Markdown' }
  );
});

// Bot starten
bot.launch();
console.log('Bot started successfully!');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

