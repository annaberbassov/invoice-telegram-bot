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
// ===============================================
// ACTION DATA FUNCTIONS (NEU)
// ===============================================

async function saveActionMessageId(actionId, messageId, chatId) {
  try {
    await pool.query(
      'INSERT INTO action_message_storage (action_id, message_id, chat_id) VALUES ($1, $2, $3) ON CONFLICT (action_id) DO UPDATE SET message_id = $2, chat_id = $3, timestamp = NOW()',
      [actionId, messageId, chatId]
    );
    console.log(`✅ Saved message_id ${messageId} for action ${actionId}`);
  } catch (error) {
    console.error('❌ Save Action Message Error:', error);
  }
}

async function getActionMessageData(actionId) {
  try {
    const result = await pool.query(
      'SELECT message_id, chat_id FROM action_message_storage WHERE action_id = $1',
      [actionId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Get Action Message Error:', error);
    return null;
  }
}

async function saveActionData(action) {
  try {
    const result = await pool.query(
      'INSERT INTO action_data (file_name, action_type, project, deadline, file_id, drive_url, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING action_id',
      [action.fileName, action.actionType, action.project, action.deadline, action.fileId, action.driveUrl, action.status]
    );
    const newId = result.rows[0].action_id;
    console.log(`✅ Saved action data for ID ${newId}`);
    return newId;
  } catch (error) {
    console.error('❌ Save Action Error:', error);
    return null;
  }
}

async function loadAllActions() {
  try {
    const result = await pool.query('SELECT * FROM action_data');
    const actions = {};
    result.rows.forEach(row => {
      actions[row.action_id] = {
        id: row.action_id,
        fileName: row.file_name,
        actionType: row.action_type,
        project: row.project,
        deadline: row.deadline,
        fileId: row.file_id,
        driveUrl: row.drive_url,
        status: row.status,
        createdAt: row.created_at
      };
    });
    return actions;
  } catch (error) {
    console.error('❌ Load Actions Error:', error);
    return {};
  }
}

async function getActionData(actionId) {
  try {
    const result = await pool.query(
      'SELECT * FROM action_data WHERE action_id = $1',
      [actionId]
    );
    if (result.rows[0]) {
      const row = result.rows[0];
      return {
        id: row.action_id,
        fileName: row.file_name,
        actionType: row.action_type,
        project: row.project,
        deadline: row.deadline,
        fileId: row.file_id,
        driveUrl: row.drive_url,
        status: row.status,
        createdAt: row.created_at
      };
    }
    return null;
  } catch (error) {
    console.error('❌ Get Action Error:', error);
    return null;
  }
}

module.exports = {
  saveMessageId,
  getMessageData,
  removeMessageData,
  saveInvoiceData,
  loadAllInvoices,
  getInvoiceData,
  // Action functions
  saveActionMessageId,
  getActionMessageData,
  saveActionData,
  loadAllActions,
  getActionData
};


