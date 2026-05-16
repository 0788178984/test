const db = require('../db/connection');

class WhatsAppService {
  constructor() {
    this.token = null;
    this.phoneId = null;
    this.baseUrl = 'https://graph.facebook.com/v18.0';
    this.initialize();
  }

  async initialize() {
    try {
      this.token = await this.getSetting('whatsapp_token');
      this.phoneId = await this.getSetting('whatsapp_phone_id');
      
      if (this.token && this.phoneId) {
        console.log('WhatsApp service initialized');
      } else {
        console.warn('WhatsApp credentials not configured');
      }
    } catch (error) {
      console.error('Failed to initialize WhatsApp service:', error);
    }
  }

  async getSetting(key) {
    const result = await db.prepare(`
      SELECT value FROM settings WHERE key = ?
    `).get(key);
    return result?.value || '';
  }

  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters and ensure Uganda format
    const clean = phoneNumber.replace(/\D/g, '');
    
    if (clean.startsWith('256')) {
      return clean;
    } else if (clean.startsWith('0')) {
      return `256${clean.substring(1)}`;
    } else if (clean.length === 9) {
      return `256${clean}`;
    }
    
    return clean;
  }

  async sendWhatsAppMessage(phoneNumber, message) {
    try {
      if (!this.token || !this.phoneId) {
        throw new Error('WhatsApp service not initialized');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      if (!formattedPhone || formattedPhone.length < 10) {
        throw new Error('Invalid phone number format');
      }

      const response = await fetch(`${this.baseUrl}/${this.phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: {
            body: message
          }
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to send WhatsApp message');
      }

      console.log('WhatsApp message sent successfully:', result);
      return {
        success: true,
        messageId: result.messages?.[0]?.id,
        status: result.messages?.[0]?.message_status
      };
    } catch (error) {
      console.error('WhatsApp sending failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendWhatsAppReceipt(phoneNumber, sale, items, storeName) {
    try {
      const itemLines = items.map(item =>
        `• ${item.product_name} x${item.quantity} — UGX ${item.line_total.toLocaleString()}`
      ).join('\n');

      const message = `🧾 *${storeName}*\n` +
        `Receipt: ${sale.sale_number}\n` +
        `Date: ${new Date(sale.created_at).toLocaleString('en-UG')}\n\n` +
        `*Items:*\n${itemLines}\n\n` +
        `Subtotal: UGX ${sale.subtotal.toLocaleString()}\n` +
        `${sale.discount_amount > 0 ? `Discount: -UGX ${sale.discount_amount.toLocaleString()}\n` : ''}` +
        `VAT (18%): UGX ${sale.tax_amount.toLocaleString()}\n` +
        `*Total: UGX ${sale.total_amount.toLocaleString()}*\n` +
        `Paid via: ${sale.payment_method.replace('_', ' ').toUpperCase()}\n` +
        `${sale.payment_reference ? `Ref: ${sale.payment_reference}\n` : ''}` +
        `${sale.change_given > 0 ? `Change: UGX ${sale.change_given.toLocaleString()}\n` : ''}` +
        `\nThank you for shopping with us! 🙏`;

      return this.sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
      console.error('Failed to send WhatsApp receipt:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWhatsAppDailySummary(phoneNumber, summary, storeName) {
    try {
      const message = `📊 *Daily Summary - ${storeName}*\n\n` +
        `📅 Date: ${summary.date}\n` +
        `🛒 Sales: ${summary.count}\n` +
        `💰 Revenue: UGX ${summary.total}\n` +
        `💵 Profit: UGX ${summary.profit}\n` +
        `🏆 Top Product: ${summary.top_product}\n\n` +
        `Keep up the great work! 🎉`;

      return this.sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
      console.error('Failed to send WhatsApp daily summary:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWhatsAppLowStockAlert(phoneNumber, productName, quantity, unit, storeName) {
    try {
      const message = `⚠️ *Low Stock Alert - ${storeName}*\n\n` +
        `📦 Product: ${productName}\n` +
        `📊 Current Stock: ${quantity} ${unit}\n` +
        `⏰ Time: ${new Date().toLocaleString('en-UG')}\n\n` +
        `Please restock soon to avoid running out!`;

      return this.sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
      console.error('Failed to send WhatsApp low stock alert:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWhatsAppExpiryWarning(phoneNumber, productName, expiryDate, storeName) {
    try {
      const isExpired = new Date(expiryDate) < new Date();
      const emoji = isExpired ? '🚨' : '⚠️';
      const status = isExpired ? 'EXPIRED' : 'EXPIRING SOON';
      
      const message = `${emoji} *${status} - ${storeName}*\n\n` +
        `📦 Product: ${productName}\n` +
        `📅 Expiry Date: ${expiryDate}\n` +
        `⏰ Alert Time: ${new Date().toLocaleString('en-UG')}\n\n` +
        `${isExpired ? 'Please remove from shelves immediately!' : 'Please take action before expiry!'}`;

      return this.sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
      console.error('Failed to send WhatsApp expiry warning:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWhatsAppMoMoConfirmation(phoneNumber, amount, method, reference, storeName) {
    try {
      const message = `✅ *Payment Confirmed - ${storeName}*\n\n` +
        `💰 Amount: UGX ${amount.toLocaleString()}\n` +
        `💳 Method: ${method.replace('_', ' ').toUpperCase()}\n` +
        `🔢 Reference: ${reference}\n` +
        `⏰ Time: ${new Date().toLocaleString('en-UG')}\n\n` +
        `Thank you for your payment! 🙏`;

      return this.sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
      console.error('Failed to send WhatsApp MoMo confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWhatsAppVoidAlert(phoneNumber, saleNumber, totalAmount, cashierName, storeName) {
    try {
      const message = `🚨 *Sale Voided - ${storeName}*\n\n` +
        `🧾 Sale Number: ${saleNumber}\n` +
        `💰 Amount: UGX ${totalAmount.toLocaleString()}\n` +
        `👤 Cashier: ${cashierName}\n` +
        `⏰ Time: ${new Date().toLocaleString('en-UG')}\n\n` +
        `Please review this transaction for approval.`;

      return this.sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
      console.error('Failed to send WhatsApp void alert:', error);
      return { success: false, error: error.message };
    }
  }

  // Interactive message templates
  async sendInteractiveMessage(phoneNumber, headerText, bodyText, buttons) {
    try {
      if (!this.token || !this.phoneId) {
        throw new Error('WhatsApp service not initialized');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      const buttonObjects = buttons.map((button, index) => ({
        type: 'reply',
        reply: {
          id: `btn_${index}`,
          title: button.title
        }
      }));

      const response = await fetch(`${this.baseUrl}/${this.phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'interactive',
          interactive: {
            type: 'button',
            header: {
              type: 'text',
              text: headerText
            },
            body: {
              text: bodyText
            },
            action: {
              buttons: buttonObjects
            }
          }
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to send interactive message');
      }

      return {
        success: true,
        messageId: result.messages?.[0]?.id
      };
    } catch (error) {
      console.error('Failed to send interactive message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send order confirmation with tracking
  async sendOrderConfirmation(phoneNumber, orderDetails) {
    const headerText = 'Order Confirmation';
    const bodyText = `Your order #${orderDetails.orderNumber} has been received!\n\n` +
      `Items: ${orderDetails.itemsCount}\n` +
      `Total: UGX ${orderDetails.total.toLocaleString()}\n` +
      `Delivery: ${orderDetails.deliveryAddress}\n\n` +
      `Choose an option below:`;

    const buttons = [
      { title: 'Track Order' },
      { title: 'Contact Support' },
      { title: 'Cancel Order' }
    ];

    return this.sendInteractiveMessage(phoneNumber, headerText, bodyText, buttons);
  }
}

module.exports = new WhatsAppService();
