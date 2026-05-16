const express = require('express');
const crypto = require('crypto');
const { authenticate, authorize } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const db = require('../db/connection');
const { createNotification } = require('./notifications');

const router = express.Router();

async function getDeveloperUserId() {
  const row = await db.prepare(`SELECT id FROM users WHERE role = 'developer' AND deleted_at IS NULL LIMIT 1`).get();
  return row?.id || null;
}

// Staff: submit help / contact developer (no in-app message to developer — ticket only)
router.post('/', authenticate, restrictToBusinessStaff, async (req, res) => {
  try {
    const { subject, body } = req.body;
    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and body are required.' });
    }
    const id = `sr-${crypto.randomBytes(12).toString('hex')}`;
    await db.prepare(
      `
      INSERT INTO support_requests (id, business_id, from_user_id, subject, body, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'))
    `
    ).run(id, req.user.business_id, req.user.id, String(subject).trim(), String(body).trim());

    const devId = await getDeveloperUserId();
    if (devId) {
      createNotification({
        type: 'help_request',
        title: `Support: ${String(subject).trim().slice(0, 80)}`,
        message: `${req.user.name} (${req.user.business_name || 'Store'}): ${String(body).trim().slice(0, 500)}`,
        severity: 'info',
        target_user_id: devId,
        business_id: req.user.business_id,
        channels: ['in_app'],
        meta: { support_request_id: id, business_id: req.user.business_id },
      });
    }

    res.status(201).json({ message: 'Request sent to your system provider.', id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to submit request.' });
  }
});

// Staff: list own business requests (admin/manager)
router.get('/', authenticate, restrictToBusinessStaff, authorize('admin', 'manager'), async (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT sr.*, u.name as from_name
      FROM support_requests sr
      JOIN users u ON u.id = sr.from_user_id
      WHERE sr.business_id = ?
      ORDER BY sr.created_at DESC
      LIMIT 100
    `
      )
      .all(req.user.business_id);
    res.json({ requests: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list requests.' });
  }
});

// Developer: all tickets
router.get('/developer/all', authenticate, authorize('developer'), async (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT sr.*, u.name as from_name, b.name as business_name, b.business_code
      FROM support_requests sr
      JOIN users u ON u.id = sr.from_user_id
      JOIN businesses b ON b.id = sr.business_id
      ORDER BY sr.created_at DESC
      LIMIT 200
    `
      )
      .all();
    res.json({ requests: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list requests.' });
  }
});

// Developer: update ticket
router.patch('/developer/:id', authenticate, authorize('developer'), async (req, res) => {
  try {
    const { status, developer_notes } = req.body;
    const row = await db.prepare(`SELECT * FROM support_requests WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Request not found.' });

    const fields = ["updated_at = datetime('now')"];
    const vals = [];
    if (status !== undefined) {
      fields.push('status = ?');
      vals.push(status);
    }
    if (developer_notes !== undefined) {
      fields.push('developer_notes = ?');
      vals.push(developer_notes);
    }
    vals.push(req.params.id);
    await db.prepare(`UPDATE support_requests SET ${fields.join(', ')} WHERE id = ?`).run(...vals);

    if (status && ['resolved', 'closed'].includes(status)) {
      const admins = db
        .prepare(
          `SELECT id FROM users WHERE business_id = ? AND role IN ('admin','manager') AND deleted_at IS NULL`
        )
        .all(row.business_id);
      for (const a of admins) {
        createNotification({
          type: 'help_response',
          title: 'Support request updated',
          message: `Your request "${row.subject}" is now: ${status}.`,
          severity: 'success',
          target_user_id: a.id,
          business_id: row.business_id,
          channels: ['in_app'],
          meta: { support_request_id: row.id },
        });
      }
    }

    res.json({ message: 'Request updated.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update request.' });
  }
});

module.exports = router;
