const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const router = express.Router();

const clients = new Map();

const addClient = (userId, role, businessId, res) => {
  clients.set(userId, { res, role, userId, business_id: businessId || null });
  console.log(`Client connected: ${userId} (${role}) biz=${businessId || 'dev'}`);
};

const removeClient = (userId) => {
  clients.delete(userId);
  console.log(`Client disconnected: ${userId}`);
};

const broadcastNotification = (notification) => {
  const data = `data: ${JSON.stringify(notification)}\n\n`;

  clients.forEach((client) => {
    if (shouldReceiveNotification(client, notification)) {
      try {
        client.res.write(data);
      } catch (error) {
        console.error('Error sending SSE data:', error);
        removeClient(client.userId);
      }
    }
  });
};

const shouldReceiveNotification = (client, notification) => {
  if (notification.type === 'unread_count') {
    if (notification._forUserId && notification._forUserId !== client.userId) {
      return false;
    }
    return true;
  }

  if (notification.target_user_id) {
    return notification.target_user_id === client.userId;
  }

  if (client.role === 'developer') {
    return false;
  }

  if (notification.business_id && client.business_id && notification.business_id !== client.business_id) {
    return false;
  }

  if (notification.target_role) {
    if (client.role !== notification.target_role) {
      return false;
    }
    return true;
  }

  if (client.role === 'admin') {
    return true;
  }

  if (client.role === 'manager') {
    const adminOnlyTypes = ['sync_completed', 'sync_failed'];
    return !adminOnlyTypes.includes(notification.type);
  }

  return true;
};

function staffNotificationWhereClause() {
  return `
    n.business_id = ?
    AND (
      n.target_user_id = ?
      OR (n.target_user_id IS NULL AND n.target_role IS NULL)
      OR (n.target_user_id IS NULL AND n.target_role = ?)
    )
  `;
}

router.get('/stream', authenticate, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const userId = req.user.id;
  const role = req.user.role;
  const businessId = req.user.business_id || null;

  addClient(userId, role, businessId, res);

  let unreadCount;
  if (role === 'developer') {
    unreadCount = (await db
      .prepare(
        `SELECT COUNT(*) as count FROM notifications WHERE target_user_id = ? AND is_read = 0`
      )
      .get(userId)).count;
  } else {
    unreadCount = (await db
      .prepare(
        `SELECT COUNT(*) as count FROM notifications n WHERE ${staffNotificationWhereClause()} AND n.is_read = 0`
      )
      .get(req.user.business_id, userId, role)).count;
  }

  res.write(`data: ${JSON.stringify({ type: 'unread_count', count: unreadCount })}\n\n`);

  req.on('close', () => {
    removeClient(userId);
  });

  req.on('error', () => {
    removeClient(userId);
  });
});

router.post(
  '/compose',
  authenticate,
  restrictToBusinessStaff,
  authorize('admin', 'manager'),
  async (req, res) => {
    try {
      const { title, message, target_user_id, target_role } = req.body;
      if (!title || !message) {
        return res.status(400).json({ error: 'Title and message are required.' });
      }
      if (!target_user_id && !target_role) {
        return res.status(400).json({ error: 'Specify target_user_id or target_role.' });
      }
      if (target_user_id && target_role) {
        return res.status(400).json({ error: 'Use either target_user_id or target_role, not both.' });
      }

      if (target_user_id) {
        const target = (await db
          .prepare(
            `SELECT id, role, business_id FROM users WHERE id = ? AND deleted_at IS NULL`
          )
          .get(target_user_id));
        if (!target || target.business_id !== req.user.business_id) {
          return res.status(400).json({ error: 'Invalid recipient.' });
        }
        if (target.role === 'developer') {
          return res.status(403).json({ error: 'You cannot message the system developer from here. Use Help & support.' });
        }
      }

      if (target_role) {
        if (!['admin', 'manager', 'cashier'].includes(target_role)) {
          return res.status(400).json({ error: 'Invalid target role.' });
        }
      }

      createNotification({
        type: 'team_message',
        title: String(title).trim(),
        message: String(message).trim(),
        severity: 'info',
        target_user_id: target_user_id || null,
        target_role: target_user_id ? null : target_role,
        business_id: req.user.business_id,
        sender_user_id: req.user.id,
        channels: ['in_app'],
        meta: { from: req.user.name },
      });

      res.status(201).json({ message: 'Notification sent.' });
    } catch (error) {
      console.error('Compose notification error:', error);
      res.status(500).json({ error: 'Failed to send notification.' });
    }
  }
);

router.get('/', authenticate, async (req, res) => {
  try {
    const { unread_only = false, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (req.user.role === 'developer') {
      let q = `SELECT n.* FROM notifications n WHERE n.target_user_id = ?`;
      const params = [req.user.id];
      if (unread_only === 'true') q += ` AND n.is_read = 0`;
      q += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit, 10), offset);
      const notifications = await db.prepare(q).all(...params);
      let cq = `SELECT COUNT(*) as total FROM notifications n WHERE n.target_user_id = ?`;
      const cp = [req.user.id];
      if (unread_only === 'true') cq += ` AND n.is_read = 0`;
      const { total } = await db.prepare(cq).get(...cp);
      return res.json({
        notifications,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    }

    let query = `
      SELECT n.*,
        CASE
          WHEN n.target_user_id = ? THEN 'user'
          WHEN n.target_role = ? THEN 'role'
          ELSE 'all'
        END as target_type
      FROM notifications n
      WHERE ${staffNotificationWhereClause()}
    `;
    const baseParams = [req.user.business_id, req.user.id, req.user.role];
    const params = [...baseParams, req.user.id, req.user.role];

    if (unread_only === 'true') {
      query += ` AND n.is_read = 0`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), offset);

    const notifications = await db.prepare(query).all(...params);

    let countQuery = `SELECT COUNT(*) as total FROM notifications n WHERE ${staffNotificationWhereClause()}`;
    const countParams = baseParams;

    if (unread_only === 'true') {
      countQuery += ` AND n.is_read = 0`;
    }

    const { total } = await db.prepare(countQuery).get(...countParams);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

router.post('/:id/read', authenticate, async (req, res) => {
  try {
    let notification;
    if (req.user.role === 'developer') {
      notification = (await db
        .prepare(
          `SELECT id FROM notifications WHERE id = ? AND target_user_id = ?`
        )
        .get(req.params.id, req.user.id));
    } else {
      notification = await db
        .prepare(
          `SELECT id FROM notifications n WHERE n.id = ? AND ${staffNotificationWhereClause()}`
        )
        .get(req.params.id, req.user.business_id, req.user.id, req.user.role);
    }

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    await db.prepare(`UPDATE notifications SET is_read = 1, sync_status = 'pending' WHERE id = ?`).run(
      req.params.id
    );

    let unreadCount;
    if (req.user.role === 'developer') {
      unreadCount = (await db
        .prepare(
          `SELECT COUNT(*) as count FROM notifications WHERE target_user_id = ? AND is_read = 0`
        )
        .get(req.user.id)).count;
    } else {
      unreadCount = (await db
        .prepare(
          `SELECT COUNT(*) as count FROM notifications n WHERE ${staffNotificationWhereClause()} AND n.is_read = 0`
        )
        .get(req.user.business_id, req.user.id, req.user.role)).count;
    }

    broadcastNotification({
      type: 'unread_count',
      count: unreadCount,
      _forUserId: req.user.id,
    });

    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
});

router.post('/read-all', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'developer') {
      await db.prepare(
        `UPDATE notifications SET is_read = 1, sync_status = 'pending' WHERE target_user_id = ? AND is_read = 0`
      ).run(req.user.id);
    } else {
      await db.prepare(
        `UPDATE notifications SET is_read = 1, sync_status = 'pending'
         WHERE id IN (
           SELECT n.id FROM notifications n
           WHERE ${staffNotificationWhereClause()} AND n.is_read = 0
         )`
      ).run(req.user.business_id, req.user.id, req.user.role);
    }

    broadcastNotification({
      type: 'unread_count',
      count: 0,
      _forUserId: req.user.id,
    });

    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read.' });
  }
});

router.get('/count', authenticate, async (req, res) => {
  try {
    let count;
    if (req.user.role === 'developer') {
      count = (await db
        .prepare(
          `SELECT COUNT(*) as count FROM notifications WHERE target_user_id = ? AND is_read = 0`
        )
        .get(req.user.id)).count;
    } else {
      count = (await db
        .prepare(
          `SELECT COUNT(*) as count FROM notifications n WHERE ${staffNotificationWhereClause()} AND n.is_read = 0`
        )
        .get(req.user.business_id, req.user.id, req.user.role)).count;
    }

    res.json({ count });
  } catch (error) {
    console.error('Get notification count error:', error);
    res.status(500).json({ error: 'Failed to fetch notification count.' });
  }
});

const createNotification = async (notificationData) => {
  try {
    const row = await db
      .prepare(
        `
      INSERT INTO notifications (
        id, type, title, message, severity, target_role, target_user_id,
        business_id, sender_user_id,
        channels, meta, created_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
      RETURNING *
    `
      )
      .get(
        notificationData.id || newId('notif'),
        notificationData.type,
        notificationData.title,
        notificationData.message,
        notificationData.severity || 'info',
        notificationData.target_role ?? null,
        notificationData.target_user_id ?? null,
        notificationData.business_id ?? null,
        notificationData.sender_user_id ?? null,
        JSON.stringify(notificationData.channels || []),
        JSON.stringify(notificationData.meta || {})
      );

    const notification = {
      ...(row || {}),
      ...notificationData,
      is_read: row ? row.is_read : 0,
    };

    broadcastNotification(notification);

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

const NOTIFICATION_EVENTS = {
  LOW_STOCK: {
    type: 'low_stock',
    severity: 'warning',
    target_role: 'manager',
    channels: ['in_app', 'sms'],
    template: (meta) => ({
      title: 'Low Stock Alert',
      message: `⚠️ Low stock: ${meta.product_name} has ${meta.qty} ${meta.unit} left. Reorder now.`,
    }),
  },

  EXPIRY_WARNING: {
    type: 'expiry_warning',
    severity: 'warning',
    target_role: 'manager',
    channels: ['in_app', 'sms'],
    template: (meta) => ({
      title: 'Expiry Warning',
      message: `⚠️ Expiry alert: ${meta.product_name} expires on ${meta.date}. Please act.`,
    }),
  },

  EXPIRY_EXPIRED: {
    type: 'expiry_expired',
    severity: 'danger',
    target_role: 'admin',
    channels: ['in_app', 'sms'],
    template: (meta) => ({
      title: 'Product Expired',
      message: `🚨 ${meta.product_name} has expired on ${meta.date} and is still in stock.`,
    }),
  },

  SALE_COMPLETED: {
    type: 'sale_completed',
    severity: 'success',
    target_role: null,
    channels: ['sms', 'whatsapp'],
    template: (meta) => ({
      title: 'Sale Completed',
      message: `Thank you for your purchase! Total: UGX ${meta.total?.toLocaleString()}`,
    }),
  },

  VOID_SALE: {
    type: 'void_sale',
    severity: 'warning',
    target_role: 'admin',
    channels: ['in_app', 'sms'],
    template: (meta) => ({
      title: 'Sale Voided',
      message: `⚠️ Sale ${meta.sale_number} (UGX ${meta.total?.toLocaleString()}) was voided by ${meta.cashier_name}.`,
    }),
  },

  DISCOUNT_APPROVAL: {
    type: 'discount_approval',
    severity: 'info',
    target_role: 'manager',
    channels: ['in_app'],
    template: (meta) => ({
      title: 'Discount Applied',
      message: `${meta.cashier_name} applied ${meta.discount}% discount on ${meta.sale_number}`,
    }),
  },

  DAILY_SUMMARY: {
    type: 'daily_summary',
    severity: 'info',
    target_role: 'admin',
    channels: ['in_app', 'sms', 'whatsapp'],
    template: (meta) => ({
      title: 'Daily Summary',
      message: `📊 Daily Summary — ${meta.date}\nSales: ${meta.count}\nRevenue: UGX ${meta.total}\nProfit: UGX ${meta.profit}\nTop: ${meta.top_product}`,
    }),
  },

  SYNC_COMPLETED: {
    type: 'sync_completed',
    severity: 'success',
    target_role: 'admin',
    channels: ['in_app'],
    template: (meta) => ({
      title: 'Sync Completed',
      message: `${meta.count} records synced to cloud successfully.`,
    }),
  },

  SYNC_FAILED: {
    type: 'sync_failed',
    severity: 'danger',
    target_role: 'admin',
    channels: ['in_app'],
    template: (meta) => ({
      title: 'Sync Failed',
      message: `Cloud sync failed. Will retry. Error: ${meta.error_message}`,
    }),
  },

  MOMO_PAYMENT_CONFIRMED: {
    type: 'momo_payment',
    severity: 'success',
    target_role: null,
    channels: ['in_app', 'sms'],
    template: (meta) => ({
      title: 'Payment Confirmed',
      message: `Payment of UGX ${meta.amount?.toLocaleString()} confirmed via ${meta.method}. Ref: ${meta.reference}. Thank you!`,
    }),
  },

  LOGIN_ALERT: {
    type: 'login_alert',
    severity: 'info',
    target_role: 'admin',
    channels: ['in_app'],
    template: (meta) => ({
      title: 'User Login',
      message: `${meta.user_name} (${meta.role}) logged in at ${meta.time}`,
    }),
  },
};

const dispatch = (eventType, meta = {}, options = {}) => {
  const event = NOTIFICATION_EVENTS[eventType];
  if (!event) {
    console.error(`Unknown notification event: ${eventType}`);
    return null;
  }

  const templateData = event.template(meta);
  const notificationData = {
    ...event,
    ...templateData,
    ...options,
    meta,
  };

  return createNotification(notificationData);
};

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.dispatch = dispatch;
module.exports.NOTIFICATION_EVENTS = NOTIFICATION_EVENTS;
