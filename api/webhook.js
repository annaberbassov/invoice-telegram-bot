const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;


export default async function handler(req, res) {
  // SOFORTIGE Antwort (< 50ms)
  res.status(200).json({ ok: true });
  
  if (req.method !== 'POST') {
    return;
  }
  
  const { callback_query } = req.body;
  if (!callback_query) {
    return;
  }
  
  await handleButtonClick(callback_query);
}

async function handleButtonClick(callbackQuery) {
  await answerCallbackQuery(callbackQuery.id, '');
  
  const data = callbackQuery.data;
  
  if (data.startsWith('reminder_')) {
    await showDateSelection(callbackQuery);
  } else if (data.startsWith('day_')) {
    await showTimeSelection(callbackQuery);
  } else if (data.startsWith('time_')) {
    await setReminder(callbackQuery);
  } else if (data.startsWith('paid_')) {
    await handlePaid(callbackQuery);
  }
}

async function showDateSelection(callbackQuery) {
  const fileId = callbackQuery.data.replace('reminder_', '');
  const today = new Date();
  
  const keyboard = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const dayText = i === 0 ? 'Heute' : 
                   i === 1 ? 'Morgen' : 
                   day.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    
    keyboard.push([{
      text: dayText,
      callback_data: `day_${fileId}_${day.getFullYear()}_${day.getMonth()}_${day.getDate()}`
    }]);
  }
  
  await editMessage(callbackQuery, '📅 <b>Datum wählen:</b>', keyboard);
}

async function showTimeSelection(callbackQuery) {
  const [, fileId, year, month, day] = callbackQuery.data.split('_');
  
  const keyboard = [
    [
      { text: '09:00', callback_data: `time_${fileId}_${year}_${month}_${day}_09_00` },
      { text: '10:00', callback_data: `time_${fileId}_${year}_${month}_${day}_10_00` },
      { text: '11:00', callback_data: `time_${fileId}_${year}_${month}_${day}_11_00` }
    ],
    [
      { text: '12:00', callback_data: `time_${fileId}_${year}_${month}_${day}_12_00` },
      { text: '16:00', callback_data: `time_${fileId}_${year}_${month}_${day}_16_00` },
      { text: '17:00', callback_data: `time_${fileId}_${year}_${month}_${day}_17_00` }
    ],
    [{ text: '18:00', callback_data: `time_${fileId}_${year}_${month}_${day}_18_00` }]
  ];
  
  const date = new Date(year, month, day);
  await editMessage(callbackQuery, `🕐 <b>Uhrzeit wählen:</b>\n${date.toLocaleDateString('de-DE')}`, keyboard);
}

async function setReminder(callbackQuery) {
  const [, fileId, year, month, day, hour, minute] = callbackQuery.data.split('_');
  const reminderDate = new Date(year, month, day, hour, minute);
  const timeString = reminderDate.toLocaleDateString('de-DE') + ' ' + hour + ':' + minute;
  
  const keyboard = [
    [
      { text: '✅ BEZAHLT', callback_data: `paid_${fileId}` },
      { text: '⏰ ÄNDERN', callback_data: `reminder_${fileId}` }
    ]
  ];
  
  await editMessage(callbackQuery, `✅ <b>Erinnerung gesetzt:</b> ${timeString}`, keyboard);
}

async function handlePaid(callbackQuery) {
  const fileId = callbackQuery.data.replace('paid_', '');
  const now = new Date().toLocaleString('de-DE');
  
  await editMessage(callbackQuery, `✅ <b>Rechnung bezahlt</b> am ${now}`, []);
}

async function answerCallbackQuery(queryId, text = '') {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: queryId, text })
  });
}

async function editMessage(callbackQuery, text, keyboard) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    })
  });
}
