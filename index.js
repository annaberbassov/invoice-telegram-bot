console.log('=== 1. SCRIPT STARTET ===');

const { Telegraf } = require('telegraf');
const http = require('http');

console.log('=== 2. MODULES GELADEN ===');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

console.log('=== 3. VARIABLEN GESETZT ===');
console.log('PORT:', PORT);
console.log('BOT_TOKEN vorhanden:', BOT_TOKEN ? 'JA' : 'NEIN');
console.log('BOT_TOKEN Länge:', BOT_TOKEN ? BOT_TOKEN.length : 0);
console.log('BOT_TOKEN erste 10 Zeichen:', BOT_TOKEN ? BOT_TOKEN.substring(0, 10) : 'LEER');

// HTTP Server
console.log('=== 4. HTTP SERVER WIRD GESTARTET ===');
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot Debug Mode');
});

server.listen(PORT, () => {
  console.log(`=== 5. HTTP SERVER LÄUFT AUF PORT ${PORT} ===`);
});

// Bot erstellen
console.log('=== 6. BOT WIRD ERSTELLT ===');
let bot;
try {
  bot = new Telegraf(BOT_TOKEN);
  console.log('=== 7. BOT OBJEKT ERFOLGREICH ERSTELLT ===');
} catch (error) {
  console.log('=== 7. FEHLER BEIM BOT ERSTELLEN ===');
  console.error('Bot Creation Error:', error);
  process.exit(1);
}

// Commands
console.log('=== 8. COMMANDS WERDEN REGISTRIERT ===');
bot.start((ctx) => {
  console.log('Start command empfangen');
  ctx.reply('Debug Bot läuft!');
});

bot.command('test', (ctx) => {
  console.log('Test command empfangen');
  ctx.reply('Test erfolgreich!');
});

console.log('=== 9. COMMANDS REGISTRIERT ===');

// Bot Launch
console.log('=== 10. BOT LAUNCH WIRD VERSUCHT ===');
bot.launch()
  .then(() => {
    console.log('=== 11. ✅ BOT LAUNCH ERFOLGREICH! ===');
  })
  .catch((error) => {
    console.log('=== 11. ❌ BOT LAUNCH FEHLGESCHLAGEN! ===');
    console.error('Launch Error Message:', error.message);
    console.error('Launch Error Code:', error.code);
    console.error('Launch Error Response:', error.response);
    console.error('Full Error:', error);
  });

// Error Handler
bot.catch((err, ctx) => {
  console.error('=== BOT RUNTIME ERROR ===', err);
});

console.log('=== 12. SETUP COMPLETE ===');




