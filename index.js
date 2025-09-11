const { Telegraf } = require('telegraf');
const http = require('http');

console.log('🚀 Bot startet...');

const bot = new Telegraf(process.env.BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// HTTP Server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot läuft!\n');
});

server.listen(PORT, () => {
  console.log(`✅ HTTP Server läuft auf Port ${PORT}`);
});

// Commands
bot.start((ctx) => {
  ctx.reply('🤖 A&A Backoffice Bot ist bereit!\n\nKommandos:\n/rechnung - Test-Rechnung\n/status - Bot-Status');
});

bot.command('rechnung', (ctx) => {
  ctx.reply('📋 Test-Rechnung erstellt!\n\nDas funktioniert bereits. Vollsystem folgt gleich! 🚀');
});

bot.command('status', (ctx) => {
  ctx.reply(`📊 Bot Status: Online ✅\n📅 Zeit: ${new Date().toLocaleString('de-DE')}`);
});

// Bot Launch mit Debug
console.log('🔄 Bot wird gestartet...');

bot.launch()
  .then(() => {
    console.log('✅ TELEGRAM BOT ERFOLGREICH GESTARTET!');
    console.log('🎯 Bot ist bereit für Kommandos!');
  })
  .catch((error) => {
    console.error('❌ Bot Start Fehler:', error.message);
    console.error('📋 Error Details:', error);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('📡 Setup komplett - warte auf Bot Launch...');



