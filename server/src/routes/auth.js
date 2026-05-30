const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, generateToken } = require('../middleware/auth');
const db = require('../db/connection');
const { paymentMethodsAvailability } = require('../services/paymentConfigService');
const { normalizeBusinessType } = require('../db/businessTypes');
const router = express.Router();

async function resolveBusinessCode(raw) {
  let code = raw !== undefined && raw !== null ? String(raw).trim().toUpperCase() : '';
  if (code) return code;
  const rows = await db.prepare(`SELECT business_code FROM businesses ORDER BY created_at`).all();
  if (rows.length === 1) return String(rows[0].business_code).trim().toUpperCase();
  return '';
}

// Login with PIN (for cashiers/quick login)
router.post('/login', async (req, res) => {
  try {
    let { pin, role, business_code } = req.body;

    if (pin !== undefined && pin !== null) {
      pin = String(pin).trim();
    }
    if (typeof role === 'string') {
      role = role.trim().toLowerCase();
    }

    if (!pin || !role) {
      return res.status(400).json({ error: 'PIN and role are required.' });
    }

    if (role === 'developer') {
      return res.status(400).json({ error: 'Developers sign in with email and password.' });
    }

    const code = await resolveBusinessCode(business_code);
    if (!code) {
      return res.status(400).json({
        error: 'Business code is required when more than one store exists (e.g. DEFAULT for the demo store).',
      });
    }

    const business = await db
      .prepare(
        `SELECT id, business_code, name, business_type, subscription_status, subscription_expires_at, payment_config FROM businesses WHERE upper(trim(business_code)) = ?`
      )
      .get(code);

    if (!business) {
      return res.status(401).json({ error: 'Unknown business code.' });
    }

    const candidates = await db
      .prepare(
        `
      SELECT id, name, email, phone, pin, role, is_active, business_id
      FROM users
      WHERE role = ? AND is_active = 1 AND deleted_at IS NULL AND business_id = ?
      ORDER BY created_at ASC, id ASC
    `
      )
      .all(role, business.id);

    if (!candidates.length) {
      const anyone = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL`).get().c;
      if (anyone === 0) {
        return res.status(401).json({
          error:
            'No staff accounts exist in this database yet. On Render, use Web login as developer after one-time seed (see server logs / README), or set SEED_IF_EMPTY=1 and ALLOW_AUTO_DEMO_SEED=1 once.',
          code: 'NO_USERS_BOOTSTRAP',
        });
      }
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    let userData = null;
    for (const row of candidates) {
      const isValidPin = await bcrypt.compare(pin, row.pin);
      if (isValidPin) {
        userData = row;
        break;
      }
    }

    if (!userData) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (!userData.id) {
      console.error('PIN login: user row has no id (data repair required).', userData.email);
      return res.status(500).json({
        error: 'This account is misconfigured (missing user id). Ask your developer to restart the server to apply database repair, or recreate the admin.',
      });
    }

    await db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(userData.id);

    const token = generateToken(userData.id);

    res.json({
      token,
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        role: userData.role,
        business_id: userData.business_id,
        business_code: business.business_code,
        business_name: business.name,
        business_type: normalizeBusinessType(business.business_type),
        subscription_status: business.subscription_status,
        subscription_expires_at: business.subscription_expires_at,
        payment_methods: await paymentMethodsAvailability(business.payment_config),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    const detail =
      process.env.NODE_ENV !== 'production' ? error.message : undefined;
    res.status(500).json({ error: 'Login failed.', ...(detail && { detail }) });
  }
});

// Login with email/password (for web admin + developer)
router.post('/login-web', async (req, res) => {
  try {
    let { email, password, business_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    email = String(email).trim().toLowerCase();

    const devUser = await db
      .prepare(
        `
      SELECT id, name, email, phone, password_hash, role, is_active, business_id
      FROM users
      WHERE role = 'developer' AND lower(trim(email)) = ? AND is_active = 1 AND deleted_at IS NULL
    `
      )
      .get(email);

    if (devUser && devUser.password_hash) {
      const ok = await bcrypt.compare(password, devUser.password_hash);
      if (ok) {
        await db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(devUser.id);
        const token = generateToken(devUser.id);
        return res.json({
          token,
          user: {
            id: devUser.id,
            name: devUser.name,
            email: devUser.email,
            phone: devUser.phone,
            role: devUser.role,
            business_id: null,
            business_code: null,
            business_name: null,
            payment_methods: { cash: true, mtn_momo: false, airtel_money: false },
          },
        });
      }
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const code = await resolveBusinessCode(business_code);
    let business = null;
    if (code) {
      business = await db
        .prepare(
          `SELECT id, business_code, name, business_type, subscription_status, subscription_expires_at, payment_config FROM businesses WHERE upper(trim(business_code)) = ?`
        )
        .get(code);
      if (!business) {
        return res.status(401).json({ error: 'Unknown business code.' });
      }
    }

    let user = null;
    if (business) {
      user = await db
        .prepare(
          `
        SELECT id, name, email, phone, password_hash, role, is_active, business_id
        FROM users
        WHERE lower(trim(email)) = ? AND business_id = ? AND is_active = 1 AND deleted_at IS NULL AND role != 'developer'
      `
        )
        .get(email, business.id);
    } else {
      const matches = await db
        .prepare(
          `
        SELECT id, name, email, phone, password_hash, role, is_active, business_id,
               (SELECT business_code FROM businesses b WHERE b.id = u.business_id) as business_code,
               (SELECT name FROM businesses b WHERE b.id = u.business_id) as business_name,
               (SELECT subscription_status FROM businesses b WHERE b.id = u.business_id) as subscription_status,
               (SELECT subscription_expires_at FROM businesses b WHERE b.id = u.business_id) as subscription_expires_at
        FROM users u
        WHERE lower(trim(email)) = ? AND is_active = 1 AND deleted_at IS NULL AND role != 'developer'
      `
        )
        .all(email);

      if (matches.length === 1) {
        user = matches[0];
        business = await db
          .prepare(
            `SELECT id, business_code, name, business_type, subscription_status, subscription_expires_at, payment_config FROM businesses WHERE id = ?`
          )
          .get(user.business_id);
      } else if (matches.length > 1) {
        return res.status(400).json({
          error: 'This email is used at more than one store. Enter your store business code.',
        });
      }
    }

    if (!user || !user.password_hash) {
      const anyone = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL`).get().c;
      if (anyone === 0) {
        return res.status(401).json({
          error:
            'No accounts exist in this database yet (common after a fresh deploy on Render). ' +
            'One-time fix: set environment variables SEED_IF_EMPTY=1 and ALLOW_AUTO_DEMO_SEED=1, redeploy, sign in as developer, then remove both variables. ' +
            'For production data you need a persistent database path or hosted Postgres.',
          code: 'NO_USERS_BOOTSTRAP',
        });
      }
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (!user.id) {
      console.error('Web login: user row has no id (data repair required).', user.email);
      return res.status(500).json({
        error: 'This account is misconfigured (missing user id). Ask your developer to restart the server to apply database repair, or recreate the admin.',
      });
    }

    await db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id);

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        business_id: user.business_id,
        business_code: business?.business_code || user.business_code,
        business_name: business?.name || user.business_name,
        business_type: normalizeBusinessType(business?.business_type ?? user.business_type),
        subscription_status: business?.subscription_status ?? user.subscription_status,
        subscription_expires_at: business?.subscription_expires_at ?? user.subscription_expires_at,
        payment_methods: business
          ? await paymentMethodsAvailability(business.payment_config)
          : { cash: true, mtn_momo: false, airtel_money: false },
      },
    });
  } catch (error) {
    console.error('Web login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      business_id: u.business_id,
      business_name: u.business_name,
      business_code: u.business_code,
      business_type: normalizeBusinessType(u.business_type),
      subscription_status: u.subscription_status,
      subscription_expires_at: u.subscription_expires_at,
      payment_methods: u.payment_methods,
    },
  });
});

// Logout (client-side token removal)
router.post('/logout', authenticate, async (req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// Change PIN
router.post('/change-pin', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'developer') {
      return res.status(400).json({ error: 'PIN login is not used for developer accounts.' });
    }

    const { currentPin, newPin } = req.body;

    if (!currentPin || !newPin) {
      return res.status(400).json({ error: 'Current PIN and new PIN are required.' });
    }

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
    }

    const user = await db.prepare(`SELECT pin FROM users WHERE id = ?`).get(req.user.id);

    const isValidPin = await bcrypt.compare(currentPin, user.pin);
    if (!isValidPin) {
      return res.status(401).json({ error: 'Current PIN is incorrect.' });
    }

    const hashedNewPin = await bcrypt.hash(newPin, 12);

    await db.prepare(`UPDATE users SET pin = ?, updated_at = datetime('now') WHERE id = ?`).run(
      hashedNewPin,
      req.user.id
    );

    res.json({ message: 'PIN changed successfully.' });
  } catch (error) {
    console.error('Change PIN error:', error);
    res.status(500).json({ error: 'Failed to change PIN.' });
  }
});

// Change password (web users)
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const user = await db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(req.user.id);

    if (!user.password_hash) {
      return res.status(400).json({ error: 'Web password not set for this user.' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      hashedNewPassword,
      req.user.id
    );

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

module.exports = router;
