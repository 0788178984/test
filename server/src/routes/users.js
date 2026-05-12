const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const db = require('../db/connection');
const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const bid = (req) => req.user.business_id;

// Get all users (admin only)
router.get('/', authorize('admin'), (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (page - 1) * limit;

    let listQuery = `
      SELECT id, name, email, phone, role, is_active, last_login, created_at, updated_at
      FROM users
      WHERE deleted_at IS NULL AND business_id = ?
    `;
    const listParams = [bid(req)];

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      listQuery += ` AND (name LIKE ? OR IFNULL(email,'') LIKE ? OR IFNULL(phone,'') LIKE ?)`;
      listParams.push(q, q, q);
    }

    listQuery += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    listParams.push(parseInt(limit, 10), offset);

    const users = db.prepare(listQuery).all(...listParams);

    let countQuery = `SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL AND business_id = ?`;
    const countParams = [bid(req)];
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      countQuery += ` AND (name LIKE ? OR IFNULL(email,'') LIKE ? OR IFNULL(phone,'') LIKE ?)`;
      countParams.push(q, q, q);
    }

    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({
      users,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

router.get('/stats/overview', authorize('admin'), (req, res) => {
  try {
    const stats = db
      .prepare(
        `
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
        COUNT(CASE WHEN role = 'manager' THEN 1 END) as manager_count,
        COUNT(CASE WHEN role = 'cashier' THEN 1 END) as cashier_count,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_users,
        COUNT(CASE WHEN last_login >= datetime('now', '-7 days') THEN 1 END) as active_last_week
      FROM users
      WHERE deleted_at IS NULL AND business_id = ?
    `
      )
      .get(bid(req));

    res.json({ stats });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to fetch user stats.' });
  }
});

// Minimal directory for in-app team messages (managers cannot access full /users list)
router.get('/directory', authorize('admin', 'manager'), (req, res) => {
  try {
    const users = db
      .prepare(
        `
      SELECT id, name, email, role
      FROM users
      WHERE deleted_at IS NULL AND is_active = 1 AND business_id = ?
        AND role IN ('admin', 'manager', 'cashier')
      ORDER BY role, name
    `
      )
      .all(bid(req));
    res.json({ users });
  } catch (error) {
    console.error('User directory error:', error);
    res.status(500).json({ error: 'Failed to fetch directory.' });
  }
});

router.get('/:id', authorize('admin'), (req, res) => {
  try {
    const user = db
      .prepare(
        `
      SELECT id, name, email, phone, role, is_active, last_login, created_at, updated_at
      FROM users
      WHERE id = ? AND deleted_at IS NULL AND business_id = ?
    `
      )
      .get(req.params.id, bid(req));

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { name, email, phone, pin, password, role } = req.body;

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and role are required.' });
    }

    if (role === 'developer') {
      return res.status(400).json({ error: 'Cannot create developer users from the store console.' });
    }

    if (!pin && !password) {
      return res.status(400).json({ error: 'Either PIN or password must be provided.' });
    }

    if (pin && !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
    }

    if (password && password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const hashedPin = pin
      ? await bcrypt.hash(pin, 12)
      : await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const hashedPassword = password ? await bcrypt.hash(password, 12) : null;

    const userId = `usr-${crypto.randomBytes(12).toString('hex')}`;

    db.prepare(
      `
      INSERT INTO users (
        id, name, email, phone, pin, password_hash, role, business_id, is_active, created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), 'pending')
    `
    ).run(userId, name, email, phone, hashedPin, hashedPassword, role, bid(req));

    res.status(201).json({
      message: 'User created successfully.',
      id: userId,
    });
  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Email already exists for this store.' });
    }
    res.status(500).json({ error: 'Failed to create user.' });
  }
});

router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { name, email, phone, pin, password, role, is_active } = req.body;

    if (role === 'developer') {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    const existingUser = db
      .prepare(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let hashedPin = null;
    let hashedPassword = null;

    if (pin) {
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
      }
      hashedPin = await bcrypt.hash(pin, 12);
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      }
      hashedPassword = await bcrypt.hash(password, 12);
    }

    db.prepare(
      `
      UPDATE users SET
        name = ?, email = ?, phone = ?, role = ?, is_active = ?,
        updated_at = datetime('now'), sync_status = 'pending'
        ${pin ? ', pin = ?' : ''}
        ${password ? ', password_hash = ?' : ''}
      WHERE id = ? AND business_id = ?
    `
    ).run(
      name,
      email,
      phone,
      role,
      is_active ? 1 : 0,
      ...(pin ? [hashedPin] : []),
      ...(password ? [hashedPassword] : []),
      req.params.id,
      bid(req)
    );

    res.json({ message: 'User updated successfully.' });
  } catch (error) {
    console.error('Update user error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Email already exists for this store.' });
    }
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

router.delete('/:id', authorize('admin'), (req, res) => {
  try {
    const existingUser = db
      .prepare(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account.' });
    }

    db.prepare(
      `UPDATE users SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ? AND business_id = ?`
    ).run(req.params.id, bid(req));

    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

router.post('/:id/reset-pin', authorize('admin'), async (req, res) => {
  try {
    const { newPin } = req.body;

    if (!newPin || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ error: 'New PIN must be exactly 4 digits.' });
    }

    const existingUser = db
      .prepare(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const hashedPin = await bcrypt.hash(newPin, 12);

    db.prepare(
      `
      UPDATE users SET
        pin = ?,
        updated_at = datetime('now'),
        sync_status = 'pending'
      WHERE id = ? AND business_id = ?
    `
    ).run(hashedPin, req.params.id, bid(req));

    res.json({ message: 'PIN reset successfully.' });
  } catch (error) {
    console.error('Reset PIN error:', error);
    res.status(500).json({ error: 'Failed to reset PIN.' });
  }
});

module.exports = router;
