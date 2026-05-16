const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../db/connection');
const { createNotification } = require('./notifications');
const {
  paymentConfigForDeveloperGet,
  mergePaymentConfig,
} = require('../services/paymentConfigService');

const router = express.Router();

router.use(authenticate, authorize('developer'));

// List all businesses / tenants
router.get('/businesses', async (req, res) => {
  try {
    const rows = await db
      .prepare(
        `
      SELECT b.id, b.name, b.business_code, b.subscription_status, b.subscription_expires_at,
             b.notes, b.created_at, b.updated_at,
        (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id AND u.deleted_at IS NULL) as user_count
      FROM businesses b
      ORDER BY b.name
    `
      )
      .all();
    res.json({ businesses: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list businesses.' });
  }
});

// Create a new licensed business
router.post('/businesses', async (req, res) => {
  try {
    const { name, business_code, subscription_status = 'trial', subscription_expires_at, notes } = req.body;
    if (!name || !business_code) {
      return res.status(400).json({ error: 'Name and business_code are required.' });
    }
    const code = String(business_code).trim().toUpperCase();
    const id = `biz-${crypto.randomBytes(8).toString('hex')}`;
    await db.prepare(
      `
      INSERT INTO businesses (id, name, business_code, subscription_status, subscription_expires_at, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `
    ).run(id, String(name).trim(), code, subscription_status, subscription_expires_at || null, notes || null);
    res.status(201).json({ id, business_code: code, message: 'Business created.' });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Business code already in use.' });
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to create business.' });
  }
});

// Update license / subscription
router.patch('/businesses/:id', async (req, res) => {
  try {
    const { name, subscription_status, subscription_expires_at, notes } = req.body;
    const existing = await db.prepare(`SELECT id FROM businesses WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Business not found.' });

    const fields = [];
    const vals = [];
    if (name !== undefined) {
      fields.push('name = ?');
      vals.push(String(name).trim());
    }
    if (subscription_status !== undefined) {
      fields.push('subscription_status = ?');
      vals.push(subscription_status);
    }
    if (subscription_expires_at !== undefined) {
      fields.push('subscription_expires_at = ?');
      vals.push(subscription_expires_at);
    }
    if (notes !== undefined) {
      fields.push('notes = ?');
      vals.push(notes);
    }
    if (!fields.length) {
      return res.status(400).json({ error: 'No updates provided.' });
    }
    fields.push("updated_at = datetime('now')");
    vals.push(req.params.id);
    await db.prepare(`UPDATE businesses SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ message: 'Business updated.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update business.' });
  }
});

// Notify store admins/managers (in-app)
router.post('/businesses/:id/notify-staff', async (req, res) => {
  try {
    const { title, message, target_role } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }
    const biz = await db.prepare(`SELECT id, name FROM businesses WHERE id = ?`).get(req.params.id);
    if (!biz) return res.status(404).json({ error: 'Business not found.' });

    if (target_role && ['admin', 'manager'].includes(target_role)) {
      createNotification({
        type: 'developer_announcement',
        title,
        message,
        severity: 'info',
        target_role,
        business_id: biz.id,
        channels: ['in_app'],
        meta: { from: 'developer' },
      });
    } else {
      createNotification({
        type: 'developer_announcement',
        title,
        message,
        severity: 'info',
        target_role: 'admin',
        business_id: biz.id,
        channels: ['in_app'],
        meta: { from: 'developer' },
      });
      createNotification({
        type: 'developer_announcement',
        title,
        message,
        severity: 'info',
        target_role: 'manager',
        business_id: biz.id,
        channels: ['in_app'],
        meta: { from: 'developer' },
      });
    }

    res.json({ message: 'Notifications queued for store staff.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to notify staff.' });
  }
});

// Create initial admin user for a business (developer onboarding)
router.post('/businesses/:id/bootstrap-admin', async (req, res) => {
  try {
    const { name, email, password, pin } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const biz = await db.prepare(`SELECT id FROM businesses WHERE id = ?`).get(req.params.id);
    if (!biz) return res.status(404).json({ error: 'Business not found.' });

    const hashedPassword = await bcrypt.hash(String(password), 12);
    const pinToStore =
      pin && /^\d{4}$/.test(String(pin)) ? String(pin) : '1234';
    const hashedPin = await bcrypt.hash(pinToStore, 12);

    const userId = `usr-${crypto.randomBytes(12).toString('hex')}`;

    await db.prepare(
      `
      INSERT INTO users (id, name, email, phone, pin, password_hash, role, business_id, is_active, created_at, updated_at, sync_status)
      VALUES (?, ?, ?, NULL, ?, ?, 'admin', ?, 1, datetime('now'), datetime('now'), 'pending')
    `
    ).run(userId, name, String(email).trim().toLowerCase(), hashedPin, hashedPassword, biz.id);

    res.status(201).json({ message: 'Admin user created for this business.', id: userId });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Email already exists for this store.' });
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to create admin.' });
  }
});

// List staff for a store (no secrets) — for lockout recovery
router.get('/businesses/:id/staff', async (req, res) => {
  try {
    const biz = await db.prepare(`SELECT id, name, business_code FROM businesses WHERE id = ?`).get(req.params.id);
    if (!biz) return res.status(404).json({ error: 'Business not found.' });
    const staff = await db
      .prepare(
        `
        SELECT id, name, email, phone, role, is_active, last_login, created_at
        FROM users
        WHERE business_id = ? AND deleted_at IS NULL AND role IN ('admin', 'manager', 'cashier')
        ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, name COLLATE NOCASE
      `
      )
      .all(req.params.id);
    res.json({ business: biz, staff });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list staff.' });
  }
});

// Reset web password and/or PIN for a staff member (lockout recovery — no DB wipe)
router.patch('/businesses/:id/staff/:userId', async (req, res) => {
  try {
    const biz = await db.prepare(`SELECT id FROM businesses WHERE id = ?`).get(req.params.id);
    if (!biz) return res.status(404).json({ error: 'Business not found.' });

    const { password, pin } = req.body || {};
    const hasPassword = password !== undefined && password !== null && String(password).trim().length > 0;
    const hasPin = pin !== undefined && pin !== null && String(pin).trim().length > 0;

    if (!hasPassword && !hasPin) {
      return res.status(400).json({ error: 'Provide a new web password and/or a 4-digit PIN.' });
    }
    if (hasPassword && String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (hasPin && !/^\d{4}$/.test(String(pin).trim())) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
    }

    const user = await db
      .prepare(
        `
        SELECT id, name, email, role FROM users
        WHERE id = ? AND business_id = ? AND deleted_at IS NULL AND role IN ('admin', 'manager', 'cashier')
      `
      )
      .get(req.params.userId, req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Staff user not found for this store.' });
    }

    const fields = [];
    const vals = [];
    if (hasPassword) {
      fields.push('password_hash = ?');
      vals.push(await bcrypt.hash(String(password).trim(), 12));
    }
    if (hasPin) {
      fields.push('pin = ?');
      vals.push(await bcrypt.hash(String(pin).trim(), 12));
    }
    fields.push("updated_at = datetime('now')");
    fields.push("sync_status = 'pending'");
    vals.push(req.params.userId);

    await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...vals);

    res.json({
      message: 'Credentials updated. Share the new password/PIN with the store only over a secure channel.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to reset credentials.' });
  }
});

// Per-business MTN / Airtel API credentials (developer only; stored on businesses.payment_config)
router.get('/businesses/:id/payment-config', async (req, res) => {
  try {
    const biz = await db.prepare(`SELECT id, name, business_code, payment_config FROM businesses WHERE id = ?`).get(req.params.id);
    if (!biz) return res.status(404).json({ error: 'Business not found.' });
    res.json({
      business_id: biz.id,
      business_code: biz.business_code,
      name: biz.name,
      config: paymentConfigForDeveloperGet(biz.payment_config),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load payment configuration.' });
  }
});

router.patch('/businesses/:id/payment-config', async (req, res) => {
  try {
    const biz = await db.prepare(`SELECT id, payment_config FROM businesses WHERE id = ?`).get(req.params.id);
    if (!biz) return res.status(404).json({ error: 'Business not found.' });
    const merged = mergePaymentConfig(biz.payment_config, req.body || {});
    await db.prepare(`UPDATE businesses SET payment_config = ?, updated_at = datetime('now') WHERE id = ?`).run(
      merged,
      req.params.id
    );
    const updated = await db.prepare(`SELECT payment_config FROM businesses WHERE id = ?`).get(req.params.id);
    res.json({
      message: 'Payment configuration saved for this store.',
      config: paymentConfigForDeveloperGet(updated.payment_config),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save payment configuration.' });
  }
});

module.exports = router;
