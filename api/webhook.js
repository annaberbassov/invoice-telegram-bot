const fetch = require('node-fetch');

export default async function handler(req, res) {
  console.log('=== WEBHOOK EMPFANGEN ===');
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body));
  console.log('BOT_TOKEN vorhanden:', !!process.env.BOT_TOKEN);
  
  // SOFORTIGE 200 OK Antwort für ALLE Requests
  res.status(200).json({ 
    ok: true, 
    status: 'webhook_active',
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // GET Request (Telegram Webhook-Test)
  if (req.method === 'GET') {
    console.log('✅ GET Request - Webhook Test erfolgreich');
    return;
  }
  
  // POST Request (Button-Klicks)
  if (req.method === 'POST' && req.body && req.body.callback_query) {
    const { callback_query } = req.body;
    console.log('🎯 Button geklickt:', callback_query.data);
    
    try {
      // Callback sofort beantworten
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          callback_query_id: callback_query.id, 
          text: '🎉 MIGRATION ERFOLGREICH!' 
        })
      });
      
      // Success-Nachricht
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: callback_query.message.chat.id,
          text: `🚀 **ERFOLG!**\n\n⚡ Vercel antwortet in <200ms\n🔒 Environment Variables funktionieren\n✅ Migration vollständig abgeschlossen!\n🎯 Button "${callback_query.data}" funktioniert perfekt!`,
          parse_mode: 'Markdown'
        })
      });
      
      console.log('✅ Button erfolgreich verarbeitet');
      
    } catch (error) {
      console.error('❌ Button-Handler Fehler:', error);
    }
  }
}


