const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
const db = require('../db/connection');
const { dispatch } = require('../routes/notifications');
const { getStoreToday, saleLocalDate } = require('../utils/storeTime');

const LD = saleLocalDate('s.created_at');

class NotificationService {
  constructor() {
    this.channels = {
      sms: smsService,
      whatsapp: whatsappService,
      in_app: this
    };
  }

  // Central notification dispatcher
  async dispatch(eventType, meta = {}, options = {}) {
    try {
      // Create in-app notification first
      const notification = dispatch(eventType, meta, options);
      
      if (!notification) {
        console.error(`Failed to create notification for event: ${eventType}`);
        return { success: false, error: 'Failed to create notification' };
      }

      // Send to configured channels
      const channels = JSON.parse(notification.channels || '[]');
      const results = {};

      for (const channel of channels) {
        if (this.channels[channel]) {
          try {
            results[channel] = await this.sendToChannel(channel, notification, meta);
          } catch (error) {
            console.error(`Failed to send ${channel} notification:`, error);
            results[channel] = { success: false, error: error.message };
          }
        }
      }

      // Update sent_via field
      const sentChannels = Object.keys(results).filter(ch => results[ch].success);
      await db.prepare(`
        UPDATE notifications SET sent_via = ? WHERE id = ?
      `).run(JSON.stringify(sentChannels), notification.id);

      return {
        success: true,
        notificationId: notification.id,
        results
      };
    } catch (error) {
      console.error('Notification dispatch error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendToChannel(channel, notification, meta) {
    switch (channel) {
      case 'sms':
        return await this.sendSMS(notification, meta);
      
      case 'whatsapp':
        return await this.sendWhatsApp(notification, meta);
      
      case 'in_app':
        // In-app notifications are handled by SSE
        return { success: true, method: 'sse' };
      
      default:
        return { success: false, error: `Unknown channel: ${channel}` };
    }
  }

  async sendSMS(notification, meta) {
    const { target_user_id, target_role } = notification;
    
    if (target_user_id) {
      // Send to specific user
      const user = await db.prepare(`
        SELECT phone FROM users WHERE id = ? AND deleted_at IS NULL
      `).get(target_user_id);
      
      if (user?.phone) {
        return await smsService.sendSMS(user.phone, notification.message);
      }
    } else if (target_role) {
      // Send to all users with role
      const users = await db.prepare(`
        SELECT phone FROM users WHERE role = ? AND is_active = 1 AND deleted_at IS NULL
      `).all(target_role);
      
      if (users.length > 0) {
        const phoneNumbers = users.map(u => u.phone).filter(p => p);
        if (phoneNumbers.length > 0) {
          return await smsService.sendBulkSMS(phoneNumbers, notification.message);
        }
      }
    } else if (meta.customer_phone) {
      // Send to customer
      return await smsService.sendSMS(meta.customer_phone, notification.message);
    }
    
    return { success: false, error: 'No recipients found' };
  }

  async sendWhatsApp(notification, meta) {
    const { target_user_id, target_role } = notification;
    
    if (target_user_id) {
      // Send to specific user
      const user = await db.prepare(`
        SELECT phone FROM users WHERE id = ? AND deleted_at IS NULL
      `).get(target_user_id);
      
      if (user?.phone) {
        return await whatsappService.sendWhatsAppMessage(user.phone, notification.message);
      }
    } else if (target_role) {
      // Send to all users with role
      const users = await db.prepare(`
        SELECT phone FROM users WHERE role = ? AND is_active = 1 AND deleted_at IS NULL
      `).all(target_role);
      
      const results = [];
      for (const user of users) {
        if (user.phone) {
          const result = await whatsappService.sendWhatsAppMessage(user.phone, notification.message);
          results.push({ phone: user.phone, ...result });
        }
      }
      
      return {
        success: results.some(r => r.success),
        results
      };
    } else if (meta.customer_phone) {
      // Send to customer
      return await whatsappService.sendWhatsAppMessage(meta.customer_phone, notification.message);
    }
    
    return { success: false, error: 'No recipients found' };
  }

  // Specific notification methods
  async sendSaleReceipt(saleId, businessId, channels = ['sms', 'whatsapp']) {
    try {
      const sale = await db.prepare(`
        SELECT s.*, c.name as customer_name, c.phone as customer_phone
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.id = ? AND s.deleted_at IS NULL AND s.business_id = ?
      `).get(saleId, businessId);

      if (!sale) {
        throw new Error('Sale not found');
      }

      const items = await db.prepare(`
        SELECT product_name, quantity, unit_price, line_total
        FROM sale_items
        WHERE sale_id = ?
      `).all(saleId);

      const storeName = await this.getStoreName();
      const results = {};

      if (channels.includes('sms') && sale.customer_phone) {
        results.sms = await smsService.sendSaleReceipt(
          sale.customer_phone,
          sale.sale_number,
          items,
          sale.total_amount,
          sale.customer_name
        );
      }

      if (channels.includes('whatsapp') && sale.customer_phone) {
        results.whatsapp = await whatsappService.sendWhatsAppReceipt(
          sale.customer_phone,
          sale,
          items,
          storeName
        );
      }

      return { success: true, results };
    } catch (error) {
      console.error('Send sale receipt error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendDailySummary(date, businessId, channels = ['sms', 'whatsapp']) {
    try {
      const day = date || getStoreToday();
      const summary = await db.prepare(`
        SELECT 
          COUNT(*) as count,
          SUM(total_amount) as revenue,
          SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price) 
                             FROM sale_items si WHERE si.sale_id = s.id)) as profit
        FROM sales s
        WHERE ${LD} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
        AND s.business_id = ?
      `).get(day, businessId);

      const topProduct = await db.prepare(`
        SELECT p.name, SUM(si.quantity) as qty
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        JOIN sales s ON s.id = si.sale_id
        WHERE ${LD} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
        AND s.business_id = ?
        GROUP BY si.product_id 
        ORDER BY qty DESC 
        LIMIT 1
      `).get(day, businessId);

      const summaryData = {
        date: day,
        count: summary.count || 0,
        total: (summary.revenue || 0).toLocaleString(),
        profit: (summary.profit || 0).toLocaleString(),
        top_product: topProduct?.name || 'N/A'
      };

      const admins = await db.prepare(`
        SELECT phone FROM users
        WHERE role = 'admin' AND is_active = 1 AND deleted_at IS NULL AND business_id = ?
      `).all(businessId);

      const results = {};

      for (const channel of channels) {
        if (channel === 'sms') {
          const phoneNumbers = admins.map(a => a.phone).filter(p => p);
          if (phoneNumbers.length > 0) {
            results.sms = await smsService.sendBulkSMS(phoneNumbers, 
              await this.formatDailySummaryMessage(summaryData)
            );
          }
        } else if (channel === 'whatsapp') {
          const whatsappResults = [];
          for (const admin of admins) {
            if (admin.phone) {
              const result = await whatsappService.sendWhatsAppDailySummary(
                admin.phone,
                summaryData,
                await this.getStoreName()
              );
              whatsappResults.push({ phone: admin.phone, ...result });
            }
          }
          results.whatsapp = {
            success: whatsappResults.some(r => r.success),
            results: whatsappResults
          };
        }
      }

      return { success: true, results };
    } catch (error) {
      console.error('Send daily summary error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendLowStockAlerts(businessId) {
    try {
      let bizFilter = '';
      const bizParams = [];
      if (businessId) {
        bizFilter = ' AND p.business_id = ?';
        bizParams.push(businessId);
      }

      const lowStockProducts = await db.prepare(`
        SELECT p.*, s.name as supplier_name
        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.current_stock <= p.minimum_stock 
        AND p.is_active = 1 
        AND p.deleted_at IS NULL
        ${bizFilter}
      `).all(...bizParams);

      const results = [];

      for (const product of lowStockProducts) {
        const recipients = await db.prepare(`
          SELECT phone, role FROM users 
          WHERE role IN ('admin', 'manager') AND is_active = 1 AND deleted_at IS NULL
          AND business_id = ?
        `).all(product.business_id);

        const recent = await db.prepare(`
          SELECT id FROM notifications
          WHERE type = 'low_stock'
          AND json_extract(meta, '$.product_id') = ?
          AND business_id = ?
          AND created_at > (NOW() - INTERVAL '24 hours')
        `).get(product.id, product.business_id);

        if (!recent) {
          for (const recipient of recipients) {
            const smsResult = await smsService.sendLowStockAlert(
              recipient.phone,
              product.name,
              product.current_stock,
              product.unit
            );

            const whatsappResult = await whatsappService.sendWhatsAppLowStockAlert(
              recipient.phone,
              product.name,
              product.current_stock,
              product.unit,
              await this.getStoreName()
            );

            results.push({
              product_id: product.id,
              recipient: recipient.phone,
              sms: smsResult,
              whatsapp: whatsappResult
            });
          }

          await dispatch('LOW_STOCK', {
            product_name: product.name,
            qty: product.current_stock,
            unit: product.unit,
            product_id: product.id
          }, { business_id: product.business_id });
        }
      }

      return { success: true, results };
    } catch (error) {
      console.error('Send low stock alerts error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendExpiryWarnings(businessId) {
    try {
      let bizFilter = '';
      const bizParams = [];
      if (businessId) {
        bizFilter = ' AND p.business_id = ?';
        bizParams.push(businessId);
      }

      const expiringProducts = await db.prepare(`
        SELECT p.*, s.name as supplier_name
        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.expiry_date IS NOT NULL 
        AND p.current_stock > 0
        AND date(p.expiry_date) <= date('now', '+7 days')
        AND p.deleted_at IS NULL
        ${bizFilter}
      `).all(...bizParams);

      const results = [];

      for (const product of expiringProducts) {
        const isExpired = new Date(product.expiry_date) < new Date();
        const eventType = isExpired ? 'EXPIRY_EXPIRED' : 'EXPIRY_WARNING';

        const recipients = await db.prepare(`
          SELECT phone, role FROM users 
          WHERE role IN ('admin', 'manager') AND is_active = 1 AND deleted_at IS NULL
          AND business_id = ?
        `).all(product.business_id);

        for (const recipient of recipients) {
          const smsResult = await smsService.sendExpiryWarning(
            recipient.phone,
            product.name,
            product.expiry_date
          );

          const whatsappResult = await whatsappService.sendWhatsAppExpiryWarning(
            recipient.phone,
            product.name,
            product.expiry_date,
            await this.getStoreName()
          );

          results.push({
            product_id: product.id,
            recipient: recipient.phone,
            sms: smsResult,
            whatsapp: whatsappResult
          });
        }

        await dispatch(eventType, {
          product_name: product.name,
          date: product.expiry_date,
          product_id: product.id
        }, { business_id: product.business_id });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Send expiry warnings error:', error);
      return { success: false, error: error.message };
    }
  }

  async getStoreName() {
    const storeName = await db.prepare(`
      SELECT value FROM settings WHERE key = 'store_name'
    `).get()?.value || 'My Supermarket';
    return storeName;
  }

  async formatDailySummaryMessage(summary) {
    return `📊 Daily Summary — ${summary.date}\n` +
      `Sales: ${summary.count}\n` +
      `Revenue: UGX ${summary.total}\n` +
      `Profit: UGX ${summary.profit}\n` +
      `Top: ${summary.top_product}\n` +
      `— ${await this.getStoreName()}`;
  }
}

module.exports = new NotificationService();
