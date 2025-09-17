const { Pool } = require('pg');

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

// Test connection on startup
pool.connect()
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch(err => console.error('❌ PostgreSQL error:', err));

// Message Storage Functions
async function saveMessageId(invoiceId, messageId, chatId) {
  try {
    await pool.query(
      'INSERT INTO message_storage (invoice_id, message_id, chat_id) VALUES ($1, $2, $3) ON CONFLICT (invoice_id) DO UPDATE SET message_id = $2, chat_id = $3, timestamp = NOW()',
      [invoiceId, messageId, chatId]
    );
    console.log(`✅ Saved message_id ${messageId} for invoice ${invoiceId}`);
  } catch (error) {
    console.error('❌ Save Message Error:', error);
  }
}

async function getMessageData(invoiceId) {
  try {
    const result = await pool.query(
      'SELECT message_id, chat_id FROM message_storage WHERE invoice_id = $1',
      [invoiceId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Get Message Error:', error);
    return null;
  }
}

async function removeMessageData(invoiceId) {
  try {
    await pool.query(
      'DELETE FROM message_storage WHERE invoice_id = $1',
      [invoiceId]
    );
    console.log(`✅ Removed message data for invoice ${invoiceId}`);
  } catch (error) {
    console.error('❌ Remove Message Error:', error);
  }
}

// Invoice Data Functions
async function saveInvoiceData(invoice) {
  try {
    const result = await pool.query(
      'INSERT INTO invoice_data (file_name, type, project, date, file_id, drive_url, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING invoice_id',
      [invoice.fileName, invoice.type, invoice.project, invoice.date, invoice.fileId, invoice.driveUrl, invoice.status]
    );
    const newId = result.rows[0].invoice_id;
    console.log(`✅ Saved invoice data for ID ${newId}`);
    return newId;
  } catch (error) {
    console.error('❌ Save Invoice Error:', error);
    return null; // ← HINZUFÜGEN: null zurückgeben statt throw
  }
}


async function loadAllInvoices() {
  try {
    const result = await pool.query('SELECT * FROM invoice_data');
    const invoices = {};
    result.rows.forEach(row => {
      invoices[row.invoice_id] = {
        id: row.invoice_id,
        fileName: row.file_name,
        type: row.type,
        project: row.project,
        date: row.date,
        fileId: row.file_id,
        driveUrl: row.drive_url,
        status: row.status,
        createdAt: row.created_at
      };
    });
    return invoices;
  } catch (error) {
    console.error('❌ Load Invoices Error:', error);
    return {};
  }
}

async function getInvoiceData(invoiceId) {
  try {
    const result = await pool.query(
      'SELECT * FROM invoice_data WHERE invoice_id = $1',
      [invoiceId]
    );
    if (result.rows[0]) {
      const row = result.rows[0];
      return {
        id: row.invoice_id,
        fileName: row.file_name,
        type: row.type,
        project: row.project,
        date: row.date,
        fileId: row.file_id,
        driveUrl: row.drive_url,
        status: row.status,
        createdAt: row.created_at
      };
    }
    return null;
  } catch (error) {
    console.error('❌ Get Invoice Error:', error);
    return null;
  }
}

module.exports = {
  saveMessageId,
  getMessageData,
  removeMessageData,
  saveInvoiceData,
  loadAllInvoices,
  getInvoiceData
};


