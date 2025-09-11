const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Neue Rechnung mit Buttons senden
bot.command('rechnung', (ctx) => {
  const invoiceId = Date.now();
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Bezahlt', `paid_${invoiceId}`),
      Markup.button.callback('⏰ Erinnerung setzen', `reminder_${invoiceId}`)
    ]
  ]);
  
  ctx.reply(`📧 Neue Rechnung #${invoiceId} eingegangen.\nBitte bearbeiten.`, buttons);
});

// Button-Clicks verarbeiten
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  
  if (data.startsWith('paid_')) {
    await ctx.answerCbQuery('Rechnung als bezahlt markiert!');
    await ctx.editMessageText('✅ Rechnung wurde als bezahlt markiert.');
  }
  
  if (data.startsWith('reminder_')) {
    const invoiceId = data.replace('reminder_', '');
    await ctx.answerCbQuery();
    
    const timeButtons = Markup.inlineKeyboard([
      [
        Markup.button.callback('In 10 Min', `setreminder_10m_${invoiceId}`),
        Markup.button.callback('In 1 Stunde', `setreminder_1h_${invoiceId}`)
      ],
      [
        Markup.button.callback('Morgen 9 Uhr', `setreminder_9am_${invoiceId}`)
      ]
    ]);
    
    await ctx.reply('⏰ Wann soll ich dich erinnern?', timeButtons);
  }
  
  if (data.startsWith('setreminder_')) {
    const parts = data.split('_');
    const timePart = parts[1];
    const invoiceId = parts[2];
    
    let reminderText = '';
    let reminderTime = 0;
    
    if (timePart === '10m') {
      reminderText = 'in 10 Minuten';
      reminderTime = 10 * 60 * 1000;
    } else if (timePart === '1h') {
      reminderText = 'in 1 Stunde'; 
      reminderTime = 60 * 60 * 1000;
    } else if (timePart === '9am') {
      reminderText = 'morgen um 9 Uhr';
      reminderTime = 24 * 60 * 60 * 1000;
    }
    
    setTimeout(() => {
      ctx.telegram.sendMessage(ctx.chat.id, `🔔 Erinnerung: Rechnung #${invoiceId} noch nicht bezahlt!`);
    }, reminderTime);
    
    await ctx.answerCbQuery();
    await ctx.reply(`✅ Erinnerung für Rechnung #${invoiceId} gesetzt: ${reminderText}`);
  }
});

bot.start((ctx) => ctx.reply('Bot läuft! Teste mit /rechnung'));
bot.launch();

console.log('Telegram Bot gestartet!');
