const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const { getStoreToday, STORE_TZ } = require('../utils/storeTime');

const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const bid = (req) => req.user.business_id;

const EXPENSE_CATEGORIES = [
  'rent',
  'utilities',
  'salaries',
  'transport',
  'supplies',
  'maintenance',
  'marketing',
  'tax',
  'other',
];

const PAYMENT_METHODS = ['cash', 'mobile_money', 'bank', 'other'];

// List expenses (filters: date, from, to, category, page, limit)
router.get('/', checkPermission('view_expenses'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      date,
      from,
      to,
      category,
      search,
    } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let where = `e.deleted_at IS NULL AND e.business_id = ?`;
    const params = [bid(req)];

    if (date) {
      where += ` AND e.expense_date = ?`;
      params.push(date);
    } else {
      if (from) {
        where += ` AND e.expense_date >= ?`;
        params.push(from);
      }
      if (to) {
        where += ` AND e.expense_date <= ?`;
        params.push(to);
      }
    }

    if (category) {
      where += ` AND e.category = ?`;
      params.push(category);
    }

    if (search) {
      where += ` AND (e.title ILIKE ? OR e.notes ILIKE ? OR e.receipt_ref ILIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const { total } = await db
      .prepare(`SELECT COUNT(*) as total FROM expenses e WHERE ${where}`)
      .get(...params);

    const listParams = [...params, parseInt(limit, 10), offset];
    const expenses = await db
      .prepare(
        `
      SELECT e.*, u.name as recorded_by_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE ${where}
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(...listParams);

    res.json({
      expenses,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: Number(total) || 0,
        pages: Math.ceil((Number(total) || 0) / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch expenses.' });
  }
});

router.get('/categories/list', checkPermission('view_expenses'), (req, res) => {
  res.json({ categories: EXPENSE_CATEGORIES, payment_methods: PAYMENT_METHODS });
});

router.get('/summary/today', checkPermission('view_expenses'), async (req, res) => {
  try {
    const date = req.query.date || getStoreToday();
    const row = await db
      .prepare(
        `
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE deleted_at IS NULL AND business_id = ? AND expense_date = ?
    `
      )
      .get(bid(req), date);

    res.json({
      date,
      timezone: STORE_TZ,
      count: Number(row?.count ?? 0),
      total: Number(row?.total ?? 0),
    });
  } catch (error) {
    console.error('Today expenses summary error:', error);
    res.status(500).json({ error: 'Failed to fetch today expenses summary.' });
  }
});

router.get('/summary', checkPermission('view_expenses'), async (req, res) => {
  try {
    const from = req.query.from || getStoreToday();
    const to = req.query.to || from;

    const totals = await db
      .prepare(
        `
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE deleted_at IS NULL AND business_id = ?
        AND expense_date >= ? AND expense_date <= ?
    `
      )
      .get(bid(req), from, to);

    const byCategory = await db
      .prepare(
        `
      SELECT category, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE deleted_at IS NULL AND business_id = ?
        AND expense_date >= ? AND expense_date <= ?
      GROUP BY category
      ORDER BY total DESC
    `
      )
      .all(bid(req), from, to);

    const byDay = await db
      .prepare(
        `
      SELECT expense_date as date, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE deleted_at IS NULL AND business_id = ?
        AND expense_date >= ? AND expense_date <= ?
      GROUP BY expense_date
      ORDER BY expense_date DESC
    `
      )
      .all(bid(req), from, to);

    res.json({
      from,
      to,
      count: Number(totals?.count ?? 0),
      total: Number(totals?.total ?? 0),
      by_category: byCategory.map((r) => ({
        category: r.category,
        count: Number(r.count),
        total: Number(r.total),
      })),
      by_day: byDay.map((r) => ({
        date: r.date,
        count: Number(r.count),
        total: Number(r.total),
      })),
    });
  } catch (error) {
    console.error('Expenses summary error:', error);
    res.status(500).json({ error: 'Failed to fetch expenses summary.' });
  }
});

router.get('/:id', checkPermission('view_expenses'), async (req, res) => {
  try {
    const expense = await db
      .prepare(
        `
      SELECT e.*, u.name as recorded_by_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.id = ? AND e.deleted_at IS NULL AND e.business_id = ?
    `
      )
      .get(req.params.id, bid(req));

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    res.json({ expense });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ error: 'Failed to fetch expense.' });
  }
});

router.post('/', checkPermission('manage_expenses'), async (req, res) => {
  try {
    const {
      title,
      category = 'other',
      amount,
      payment_method = 'cash',
      expense_date,
      notes,
      receipt_ref,
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Expense title is required.' });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero.' });
    }

    const cat = EXPENSE_CATEGORIES.includes(category) ? category : 'other';
    const pay = PAYMENT_METHODS.includes(payment_method) ? payment_method : 'cash';
    const dateStr = expense_date || getStoreToday();

    const expenseId = newId('exp');
    await db
      .prepare(
        `
      INSERT INTO expenses (
        id, business_id, user_id, title, category, amount, payment_method,
        expense_date, notes, receipt_ref, created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')
    `
      )
      .run(
        expenseId,
        bid(req),
        req.user.id,
        String(title).trim(),
        cat,
        amt,
        pay,
        dateStr,
        notes || null,
        receipt_ref || null
      );

    const expense = await db
      .prepare(`SELECT * FROM expenses WHERE id = ?`)
      .get(expenseId);

    res.status(201).json({
      message: 'Expense recorded successfully.',
      expense,
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to record expense.' });
  }
});

router.put('/:id', checkPermission('manage_expenses'), async (req, res) => {
  try {
    const existing = await db
      .prepare(`SELECT id FROM expenses WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existing) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    const {
      title,
      category,
      amount,
      payment_method,
      expense_date,
      notes,
      receipt_ref,
    } = req.body;

    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ error: 'Expense title cannot be empty.' });
      }
      updates.push('title = ?');
      params.push(String(title).trim());
    }
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(EXPENSE_CATEGORIES.includes(category) ? category : 'other');
    }
    if (amount !== undefined) {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than zero.' });
      }
      updates.push('amount = ?');
      params.push(amt);
    }
    if (payment_method !== undefined) {
      updates.push('payment_method = ?');
      params.push(PAYMENT_METHODS.includes(payment_method) ? payment_method : 'cash');
    }
    if (expense_date !== undefined) {
      updates.push('expense_date = ?');
      params.push(expense_date);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
    }
    if (receipt_ref !== undefined) {
      updates.push('receipt_ref = ?');
      params.push(receipt_ref || null);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    updates.push("updated_at = datetime('now')", "sync_status = 'pending'");
    params.push(req.params.id, bid(req));

    await db
      .prepare(
        `UPDATE expenses SET ${updates.join(', ')} WHERE id = ? AND business_id = ?`
      )
      .run(...params);

    const expense = await db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(req.params.id);

    res.json({ message: 'Expense updated successfully.', expense });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update expense.' });
  }
});

router.delete('/:id', checkPermission('manage_expenses'), async (req, res) => {
  try {
    const existing = await db
      .prepare(`SELECT id FROM expenses WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existing) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    await db
      .prepare(
        `UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now'), sync_status = 'pending' WHERE id = ? AND business_id = ?`
      )
      .run(req.params.id, bid(req));

    res.json({ message: 'Expense removed successfully.' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense.' });
  }
});

module.exports = router;
