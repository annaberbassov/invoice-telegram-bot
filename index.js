const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// HTTP Server
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot running');
}).listen(PORT);

console.log('Bot starting...');

// Sichere Rechnung ohne problematische Formatierung
bot.command('rechnung', (ctx) => {
  console.log('Rechnung command received');
  
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Bezahlt', 'paid_123'),
      Markup.button.callback('❌ Problem', 'problem_123')
    ],
    [
      Markup.button.callback('⏰ Erinnerung setzen', 'reminder_123')
    ]
  ]);
  
  // EINFACHSTE TEXT-VERSION ohne Markdown
  ctx.reply(
    'Neue Rechnung eingegangen\n\n' +
    'Datei: test_rechnung.pdf\n' +
    'Typ: rechnung\n' +
    'Projekt: Test Projekt\n' +
    'Datum: 2025_09_11\n' +
    'Drive-Link: https://drive.google.com/file/d/test123/view\n\n' +
    'Bitte Aktion wählen:',
    buttons
  );
});

bot.action('paid_123', async (ctx) => {
  await ctx.answerCbQuery('Bezahlt!');
  await ctx.editMessageText('✅ Rechnung bezahlt');
});

bot.action('problem_123', async (ctx) => {
  await ctx.answerCbQuery('Problem!');
  await ctx.editMessageText('❌ Problem markiert');
});

bot.action('reminder_123', async (ctx) => {
  await ctx.answerCbQuery('Erinnerung!');
  
  const calendar = Markup.inlineKeyboard([
    [Markup.button.callback('📅 Heute', 'date_123_heute')],
    [Markup.button.callback('📅 Morgen', 'date_123_morgen')]
  ]);
  
  ctx.reply('Wähle den Tag:', calendar);
});

bot.action(/^date_123_(.+)/, async (ctx) => {
  const day = ctx.match[1];
  await ctx.answerCbQuery();
  
  const times = Markup.inlineKeyboard([
    [Markup.button.callback('🕐 20:00', 'time_123_20:00')],
    [Markup.button.callback('🕐 21:00', 'time_123_21:00')]
  ]);
  
  ctx.editMessageText(`Datum: ${day}\n\nWähle die Zeit:`, times);
});

bot.action(/^time_123_(.+)/, async (ctx) => {
  const time = ctx.match[1];
  await ctx.answerCbQuery('Erinnerung gesetzt!');
  
  ctx.editMessageText(`✅ Erinnerung gesetzt für ${time}`);
});

bot.command('test', (ctx) => ctx.reply('Test OK!'));
bot.start((ctx) => ctx.reply('Bot läuft!'));

bot.launch();
console.log('Bot started successfully!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));




