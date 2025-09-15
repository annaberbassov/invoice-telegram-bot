const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'messages.json');

function loadMessages() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('❌ Load Messages Error:', error);
    return {};
  }
}

function saveMessageId(invoiceId, messageId, chatId) {
  try {
    const data = loadMessages();
    data[invoiceId] = {
      message_id: messageId,
      chat_id: chatId,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Saved message_id ${messageId} for invoice ${invoiceId}`);
  } catch (error) {
    console.error('❌ Save Message Error:', error);
  }
}

function getMessageData(invoiceId) {
  const data = loadMessages();
  return data[invoiceId];
}

function removeMessageData(invoiceId) {
  try {
    const data = loadMessages();
    if (data[invoiceId]) {
      delete data[invoiceId];
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
      console.log(`✅ Removed message data for invoice ${invoiceId}`);
    }
  } catch (error) {
    console.error('❌ Remove Message Error:', error);
  }
}

module.exports = {
  saveMessageId,
  getMessageData,
  removeMessageData
};


