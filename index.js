const { Telegraf, Markup } = require('telegraf');
const http = require('http');

console.log('=== STARTING BOT ===');

// HTTP Server
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!\n');
});

server.listen(PORT, () => {
  console.log(`HTTP Server läuft auf Port ${PORT}`);
});

// Bot Token
const BOT_TOKEN = process.env.BOT_TOKEN;
console.log('Bot Token vorhanden:', BOT_TOKEN ? 'JA' : 'NEIN');

const bot = new Telegraf(BOT_TOKEN);
console.log('Bot erfolgreich erstellt');

// Daten speichern
const invoiceData = new Map();
const reminders = new Map();

// Test-Rechnung - MARKDOWN REPARIERT
bot.command('rechnung', (ctx) => {
  console.log('Rechnung-Kommando empfangen');
  
  const invoice = {
    id: Date.now(),
    fileName: 'test_rechnung.pdf',
    type: 'rechnung', 
    project: 'Test Projekt',
    date: '2025_09_11',
    driveUrl: 'https://drive.google.com/file/d/test123/view'
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
  
  // SICHERE TEXT-FORMATIERUNG ohne problematische Zeichen
  const message = 
    `📧 *Neue Rechnung eingegangen*\n\n` +
    `📄 *Datei:* ${invoice.fileName}\n` +
    `💰 *Typ:* ${invoice.type}\n` +
    `🏢 *Projekt:* ${invoice.project}\n` +
    `📅 *Datum:* ${invoice.date}\n` +
    `🔗 *Drive-Link:* ${invoice.driveUrl}\n\n` +
    `Bitte Aktion wählen:`;
  
  ctx.reply(message, {
    ...buttons,
    parse_mode: 'Markdown'
  });
});

// Apps Script Integration - REPARIERT
bot.command('newInvoice', (ctx) => {
  console.log('newInvoice-Kommando empfangen');
  
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
    
    const shortName = invoice.fileName.length > 40 ? 
                     invoice.fileName.substring(0, 37) + '...' : 
                     invoice.fileName;
    
    const message = 
      `📧 *Neue Rechnung eingegangen*\n\n` +
      `📄 *Datei:* ${shortName}\n` +
      `💰 *Typ:* ${invoice.type}\n` +
      `🏢 *Projekt:* ${invoice.project}\n` +
      `📅 *Datum:* ${invoice.date}\n` +
      `🔗 *Drive-Link:* ${invoice.driveUrl}\n\n` +
      `Bitte Aktion wählen:`;
    
    ctx.reply(message, {
      ...buttons,
      parse_mode: 'Markdown'
    });
  }
});

// Bezahlt Button
bot.action(/^paid_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Rechnung als bezahlt markiert! ✅');
  
  const invoice = invoiceData.get(invoiceId);
  const fileName = invoice ? invoice.fileName : invoiceId;
  
  await ctx.editMessageText(
    `✅ *Rechnung bezahlt*\n\n` +
    `📄 *Datei:* ${fileName}\n` +
    `📅 *Bezahlt am:* ${new Date().toLocaleDateString('de-DE')}\n` +
    `⏰ *Zeit:* ${new Date().toLocaleTimeString('de-DE')}`,
    { parse_mode: 'Markdown' }
  );
  
  if (invoice) {
    invoiceData.delete(invoiceId);
  }
});

// Problem Button  
bot.action(/^problem_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery('Problem markiert! ❌');
  
  const invoice = invoiceData.get(invoiceId);
  const fileName = invoice ? invoice.fileName : invoiceId;
  
  await ctx.editMessageText(
    `❌ *Problem mit Rechnung*\n\n` +
    `📄 *Datei:* ${fileName}\n` +
    `⚠️ *Status:* Problemfall\n` +
    `📅 *Gemeldet am:* ${new Date().toLocaleDateString('de-DE')}`,
    { parse_mode: 'Markdown' }
  );
});

// Erinnerung Button - Kalender
bot.action(/^reminder_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  await ctx.answerCbQuery();
  console.log(`Erinnerung-Button für ${invoiceId} geklickt`);
  
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

// Datum gewählt - Uhrzeit wählen
bot.action(/^date_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  
  await ctx.answerCbQuery();
  console.log(`Datum gewählt: ${selectedDate} für ${invoiceId}`);
  
  const times = ['09:00', '10:00', '11:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
  
  const timeButtons = times.map(time => [
    Markup.button.callback(`🕐 ${time}`, `time_${invoiceId}_${selectedDate}_${time}`)
  ]);
  
  const timeKeyboard = Markup.inlineKeyboard(timeButtons);
  
  const dateObj = new Date(selectedDate);
  const formattedDate = dateObj.toLocaleDateString('de-DE');
  
  ctx.editMessageText(
    `⏰ *Erinnerung setzen*\n\n📅 *Datum:* ${formattedDate}\n\nWähle die Zeit:`,
    { ...timeKeyboard, parse_mode: 'Markdown' }
  );
});

// Zeit gewählt - Erinnerung speichern
bot.action(/^time_(.+)_(.+)_(.+)/, async (ctx) => {
  const invoiceId = ctx.match[1];
  const selectedDate = ctx.match[2];
  const selectedTime = ctx.match[3];
  
  await ctx.answerCbQuery('Erinnerung gesetzt! ⏰');
  console.log(`Erinnerung gesetzt: ${selectedDate} ${selectedTime} für ${invoiceId}`);
  
  const [hours, minutes] = selectedTime.split(':');
  const reminderDate = new Date(selectedDate);
  reminderDate.setHours(parseInt(hours), parseInt(minutes));
  
  const timeUntilReminder = reminderDate.getTime() - Date.now();
  
  if (timeUntilReminder > 0) {
    const reminderId = `${invoiceId}_${Date.now()}`;
    reminders.set(reminderId, {
      invoiceId: invoiceId,
      chatId: ctx.chat.id,
      reminderDate: reminderDate
    });
    
    setTimeout(() => {
      const invoice = invoiceData.get(invoiceId);
      const fileName = invoice ? invoice.fileName : `Rechnung ${invoiceId}`;
      
      ctx.telegram.sendMessage(ctx.chat.id,
        `🔔 *ERINNERUNG*\n\n` +
        `⚠️ Rechnung noch nicht bezahlt!\n\n` +
        `📄 *Datei:* ${fileName}\n` +
        `📅 *Erinnerung für:* ${reminderDate.toLocaleDateString('de-DE')} ${reminderDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}\n\n` +
        `Was möchtest du tun?`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '💸 Jetzt bezahlt', callback_data: `paid_${invoiceId}` },
                { text: '⏰ Neue Erinnerung', callback_data: `reminder_${invoiceId}` }
              ],
              [
                { text: '🔕 Ignorieren', callback_data: 'ignore' }
              ]
            ]
          }
        }
      );
      
      reminders.delete(reminderId);
      console.log(`Erinnerung für ${invoiceId} gesendet`);
    }, timeUntilReminder);
  }
  
  const formattedDate = reminderDate.toLocaleDateString('de-DE');
  const formattedTime = reminderDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  
  ctx.editMessageText(
    `✅ *Erinnerung gesetzt*\n\n` +
    `📄 *Rechnung:* ${invoiceData.get(invoiceId)?.fileName || invoiceId}\n` +
    `⏰ *Erinnerung:* ${formattedDate} um ${formattedTime}\n\n` +
    `Du wirst zur gewählten Zeit erinnert! 🔔`,
    { parse_mode: 'Markdown' }
  );
});

// Ignore Handler
bot.action('ignore', async (ctx) => {
  await ctx.answerCbQuery('Erinnerung ignoriert');
  await ctx.editMessageText('🔕 Erinnerung wurde ignoriert.');
});

// Test-Kommandos
bot.start((ctx) => {
  console.log('Start-Kommando empfangen');
  ctx.reply('🤖 Rechnungs-Bot läuft erfolgreich!');
});

bot.command('test', (ctx) => {
  console.log('Test-Kommando empfangen');
  ctx.reply('🎯 Test erfolgreich!');
});

// Bot starten
bot.launch();
console.log('✅ Bot erfolgreich gestartet!');

// Error Handler
bot.catch((err, ctx) => {
  console.error('Bot Error:', err);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('=== BOT SETUP COMPLETE ===');



