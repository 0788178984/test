const AfricasTalking = require('africastalking');
const db = require('../db/connection');

class SMSService {
  constructor() {
    this.at = null;
    this.initialize();
  }

  async initialize() {
    try {
      const settings = await this.getSettings();
      if (settings.username && settings.apiKey) {
        this.at = AfricasTalking({
          username: settings.username,
          apiKey: settings.apiKey,
        });
        console.log('Africa\'s Talking SMS service initialized');
      } else {
        console.warn('Africa\'s Talking credentials not configured');
      }
    } catch (error) {
      console.error('Failed to initialize SMS service:', error);
    }
  }

  async getSettings() {
    const username = await db.prepare(`
      SELECT value FROM settings WHERE key = 'africastalking_username'
    `).get()?.value || '';

    const apiKey = await db.prepare(`
      SELECT value FROM settings WHERE key = 'africastalking_api_key'
    `).get()?.value || '';

    return { username, apiKey };
  }

  formatPhoneNumber(phoneNumber) {
    // Ensure Uganda format: +256XXXXXXXXX
    if (!phoneNumber) return '';
    
    const clean = phoneNumber.replace(/\D/g, '');
    
    if (clean.startsWith('256')) {
      return `+${clean}`;
    } else if (clean.startsWith('0')) {
      return `+256${clean.substring(1)}`;
    } else if (clean.length === 9) {
      return `+256${clean}`;
    }
    
    return phoneNumber.startsWith('+') ? phoneNumber : `+${clean}`;
  }

  async sendSMS(phoneNumber, message) {
    try {
      if (!this.at) {
        throw new Error('SMS service not initialized');
      }

      const formatted = this.formatPhoneNumber(phoneNumber);
      if (!formatted) {
        throw new Error('Invalid phone number format');
      }

      const sms = this.at.SMS;
      const result = await sms.send({
        to: [formatted],
        message,
        from: process.env.AT_SENDER_ID || 'SUPERMARKET',
      });

      console.log('SMS sent successfully:', result);
      return {
        success: true,
        messageId: result.SMSMessageData?.Recipients?.[0]?.messageId,
        status: result.SMSMessageData?.Recipients?.[0]?.status
      };
    } catch (error) {
      console.error('SMS sending failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendBulkSMS(phoneNumbers, message) {
    try {
      if (!this.at) {
        throw new Error('SMS service not initialized');
      }

      const formattedNumbers = phoneNumbers
        .map(phone => this.formatPhoneNumber(phone))
        .filter(phone => phone);

      if (formattedNumbers.length === 0) {
        throw new Error('No valid phone numbers');
      }

      const sms = this.at.SMS;
      const result = await sms.send({
        to: formattedNumbers,
        message,
        from: process.env.AT_SENDER_ID || 'SUPERMARKET',
      });

      console.log('Bulk SMS sent successfully:', result);
      return {
        success: true,
        messageId: result.SMSMessageData?.MessageId,
        recipients: result.SMSMessageData?.Recipients || []
      };
    } catch (error) {
      console.error('Bulk SMS sending failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getDeliveryStatus(messageId) {
    try {
      if (!this.at) {
        throw new Error('SMS service not initialized');
      }

      const sms = this.at.SMS;
      const result = await sms.getMessageStatus(messageId);

      return {
        success: true,
        status: result.SMSMessageData?.Recipients?.[0]?.status
      };
    } catch (error) {
      console.error('Failed to get delivery status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Template methods for different notification types
  async sendLowStockAlert(phoneNumber, productName, quantity, unit) {
    const message = `⚠️ Low stock: ${productName} has ${quantity} ${unit} left. Reorder now. — ${await this.getStoreName()}`;
    return this.sendSMS(phoneNumber, message);
  }

  async sendExpiryWarning(phoneNumber, productName, expiryDate) {
    const message = `⚠️ Expiry alert: ${productName} expires on ${expiryDate}. Please act. — ${await this.getStoreName()}`;
    return this.sendSMS(phoneNumber, message);
  }

  async sendSaleReceipt(phoneNumber, saleNumber, items, totalAmount, customerName) {
    const itemLines = items.map(item => 
      `${item.product_name} x${item.quantity} - UGX ${item.line_total.toLocaleString()}`
    ).join('\n');

    const message = `🧾 ${await this.getStoreName()}\n` +
      `Receipt: ${saleNumber}\n` +
      `Customer: ${customerName || 'Guest'}\n\n` +
      `${itemLines}\n\n` +
      `Total: UGX ${totalAmount.toLocaleString()}\n` +
      `Thank you for shopping with us! 🙏`;

    return this.sendSMS(phoneNumber, message);
  }

  async sendDailySummary(phoneNumber, summary) {
    const message = `📊 Daily Summary — ${summary.date}\n` +
      `Sales: ${summary.count}\n` +
      `Revenue: UGX ${summary.total}\n` +
      `Profit: UGX ${summary.profit}\n` +
      `Top: ${summary.top_product}\n` +
      `— ${await this.getStoreName()}`;

    return this.sendSMS(phoneNumber, message);
  }

  async sendVoidSaleAlert(phoneNumber, saleNumber, totalAmount, cashierName) {
    const message = `⚠️ Sale ${saleNumber} (UGX ${totalAmount.toLocaleString()}) was voided by ${cashierName}. — ${await this.getStoreName()}`;
    return this.sendSMS(phoneNumber, message);
  }

  async sendMoMoPaymentConfirmation(phoneNumber, amount, method, reference) {
    const message = `Payment of UGX ${amount.toLocaleString()} confirmed via ${method.replace('_', ' ').toUpperCase()}. Ref: ${reference}. Thank you! — ${await this.getStoreName()}`;
    return this.sendSMS(phoneNumber, message);
  }

  async getStoreName() {
    const storeName = await db.prepare(`
      SELECT value FROM settings WHERE key = 'store_name'
    `).get()?.value || 'My Supermarket';
    return storeName;
  }
}

module.exports = new SMSService();
