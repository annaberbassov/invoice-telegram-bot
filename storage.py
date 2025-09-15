# storage.py - Kompletter Code
import json
import os
from datetime import datetime

def load_messages():
    """Load message data from JSON file"""
    if os.path.exists('messages.json'):
        try:
            with open('messages.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {}
    return {}

def save_message_id(invoice_id, message_id, chat_id):
    """Save message ID to JSON file"""
    data = load_messages()
    data[invoice_id] = {
        'message_id': message_id,
        'chat_id': chat_id,
        'timestamp': datetime.now().isoformat()
    }
    with open('messages.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✅ Saved message_id {message_id} for invoice {invoice_id}")

def get_message_data(invoice_id):
    """Get message data for editing"""
    data = load_messages()
    return data.get(invoice_id)

def remove_message_data(invoice_id):
    """Remove message data when no longer needed"""
    data = load_messages()
    if invoice_id in data:
        del data[invoice_id]
        with open('messages.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"✅ Removed message data for invoice {invoice_id}")
