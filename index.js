const { Telegraf } = require('telegraf');
const http = require('http');

console.log('=== STARTING BOT ===');

// HTTP Server zuerst
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!\n');
});

server.listen(PORT, () => {
  console.log(`HTTP Server läuft auf Port ${PORT}`);
});

// Bot Token prüfen
const BOT_TOKEN = process.env.BOT_TOKEN;
console.log('Bot Token vorhanden:', BOT_TOKEN ? 'JA' : 'NEIN');
console.log('Bot Token Länge:', BOT_TOKEN ? BOT_TOKEN.length : 0);

if (!BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN nicht gefunden!');
  process.exit(1);
}

// Bot erstellen
let bot;
try {
  console.log('Erstelle Bot...');
  bot = new Telegraf(BOT_TOKEN);
  console.log('Bot erfolgreich erstellt');
} catch (error) {
  console.error('FEHLER beim Bot erstellen:', error.message);
  process.exit(1);
}

// Bot Kommandos
bot.start((ctx) => {
  console.log('Start-Kommando empfangen');
  ctx.reply('🤖 Bot läuft erfolgreich!');
});

bot.command('rechnung', (ctx) => {
  console.log('Rechnung-Kommando empfangen');
  ctx.reply('✅ Rechnung-Test erfolgreich!');
});

bot.command('test', (ctx) => {
  console.log('Test-Kommando empfangen');
  ctx.reply('🎯 Test erfolgreich!');
});

// Bot starten
try {
  console.log('Starte Bot...');
  bot.launch();
  console.log('✅ Bot erfolgreich gestartet!');
} catch (error) {
  console.error('FEHLER beim Bot starten:', error.message);
  process.exit(1);
}

// Error Handler
bot.catch((err, ctx) => {
  console.error('Bot Error:', err);
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Stopping bot...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('Stopping bot...');  
  bot.stop('SIGTERM');
});

console.log('=== BOT SETUP COMPLETE ===');


