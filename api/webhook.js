const fetch = require('node-fetch');

export default async function handler(req, res) {
  console.log('=== WEBHOOK EMPFANGEN ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers));
  console.log('Body:', JSON.stringify(req.body));
  console.log('BOT_TOKEN exists:', !!process.env.BOT_TOKEN);
  console.log('CHAT_ID exists:', !!process.env.CHAT_ID);
  
  // SOFORTIGE 200 OK Antwort an Telegram
  res.status(200).json({ 
    ok: true, 
    status: 'webhook_active',
    timestamp: new Date().toISOString()
  });
  
  // GET Request für Webhook-Test
  if (req.method === 'GET') {
    return;
  }
  
  // POST Request verarbeiten
  if (req.method === 'POST' && req.body) {
    const { callback_query } = req.body;
    
    if (callback_query) {
      console.log('Button geklickt:', callback_query.data);
      
      try {
        // Callback beantworten
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            callback_query_id: callback_query.id, 
            text: '✅ Funktioniert!' 
          })
        });
        
        // Debug-Nachricht senden
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: callback_query.message.chat.id,
            text: `🎉 SUCCESS: Button "${callback_query.data}" funktioniert perfekt!\n\n⚡ Vercel antwortet in <200ms\n🔒 Environment Variables funktionieren\n✅ Migration erfolgreich abgeschlossen!`,
            parse_mode: 'HTML'
          })
        });
        
        console.log('✅ Button erfolgreich verarbeitet');
        
      } catch (error) {
        console.error('❌ Fehler bei Button-Verarbeitung:', error);
      }
    }
  }
}

