const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const { roundUgx } = require('../utils/money');
const { getStoreToday, STORE_TZ } = require('../utils/storeTime');
const { dispatchToSupervisors } = require('./notifications');

const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const bid = (req) => req.user.business_id;

function expenseNotificationMeta(req, expense, extra = {}) {
  return {
    actor_name: req.user.name,
    title: expense.title,
    amount: Number(expense.amount),
    expense_type: expense.expense_type || 'cash_out',
    payment_method: expense.payment_method,
    expense_id: expense.id,
    expense_date: expense.expense_date,
    ...extra,
  };
}

function notifySupervisorsOfExpense(req, eventType, expense, extra = {}) {
  if (!expense) return;
  dispatchToSupervisors(eventType, expenseNotificationMeta(req, expense, extra), {
    business_id: bid(req),
    sender_user_id: req.user.id,
  });
}

function describeExpenseChanges(existing, body) {
  const parts = [];
  if (body.title !== undefined && String(body.title).trim() !== existing.title) {
    parts.push('title');
  }
  if (body.category !== undefined && body.category !== existing.category) {
    parts.push('category');
  }
  if (body.amount !== undefined && roundUgx(body.amount) !== roundUgx(existing.amount)) {
    parts.push('amount');
  }
  if (body.payment_method !== undefined && body.payment_method !== existing.payment_method) {
    parts.push('payment method');
  }
  if (body.expense_date !== undefined && body.expense_date !== existing.expense_date) {
    parts.push('date');
  }
  if (body.notes !== undefined && (body.notes || null) !== (existing.notes || null)) {
    parts.push('notes');
  }
  if (body.receipt_ref !== undefined && (body.receipt_ref || null) !== (existing.receipt_ref || null)) {
    parts.push('receipt reference');
  }
  return parts.join(', ');
}

const EXPENSE_TYPES = ['cash_out', 'stock_usage'];
const EXPENSE_CATEGORIES = [
  'rent',
  'utilities',
  'salaries',
  'transport',
  'lunch',
  'supplies',
  'maintenance',
  'marketing',
  'tax',
  'other',
];

/** Overhead / payroll — admin and manager only; not for cashier till entries. */
const MANAGER_ONLY_CATEGORIES = ['rent', 'utilities', 'salaries', 'tax', 'marketing'];

const PAYMENT_METHODS = ['cash', 'mobile_money', 'bank', 'other'];

function isSupervisorRole(user) {
  return user?.role === 'admin' || user?.role === 'manager';
}

function recordableCategoriesForUser(user) {
  if (isSupervisorRole(user)) return EXPENSE_CATEGORIES;
  return EXPENSE_CATEGORIES.filter((c) => !MANAGER_ONLY_CATEGORIES.includes(c));
}

function assertCashierCanUseCategory(user, category, { existingCategory } = {}) {
  if (isSupervisorRole(user)) return;

  const restricted = MANAGER_ONLY_CATEGORIES.includes(category)
    || (existingCategory && MANAGER_ONLY_CATEGORIES.includes(existingCategory));

  if (restricted) {
    const err = new Error(
      'This expense category is restricted to admin or manager (e.g. salaries, rent, tax).'
    );
    err.status = 403;
    throw err;
  }
}

const EXPENSE_SUMMARY_SQL = `
  SELECT
    COUNT(*) as count,
    COALESCE(SUM(amount), 0) as total,
    COALESCE(SUM(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN amount ELSE 0 END), 0) as cash_total,
    COALESCE(SUM(CASE WHEN expense_type = 'stock_usage' THEN amount ELSE 0 END), 0) as stock_total,
    COUNT(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN 1 END) as cash_count,
    COUNT(CASE WHEN expense_type = 'stock_usage' THEN 1 END) as stock_count
  FROM expenses
  WHERE deleted_at IS NULL AND business_id = ?
`;

function normalizeExpenseType(value) {
  return EXPENSE_TYPES.includes(value) ? value : 'cash_out';
}

function mapSummaryRow(row) {
  return {
    count: Number(row?.count ?? 0),
    total: Number(row?.total ?? 0),
    cash_total: Number(row?.cash_total ?? 0),
    stock_total: Number(row?.stock_total ?? 0),
    cash_count: Number(row?.cash_count ?? 0),
    stock_count: Number(row?.stock_count ?? 0),
  };
}

async function getProductForExpense(tx, productId, businessId) {
  return tx
    .prepare(
      `
      SELECT id, name, current_stock, buying_price
      FROM products
      WHERE id = ? AND business_id = ? AND deleted_at IS NULL AND is_active = 1
    `
    )
    .get(productId, businessId);
}

async function deductStockForExpense(tx, { productId, quantity, userId, businessId, reason, expenseId }) {
  const product = await getProductForExpense(tx, productId, businessId);
  if (!product) {
    const err = new Error('Product not found or inactive.');
    err.status = 404;
    throw err;
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    const err = new Error('Quantity must be greater than zero.');
    err.status = 400;
    throw err;
  }

  const quantityBefore = Number(product.current_stock) || 0;
  const quantityAfter = quantityBefore - qty;
  if (quantityAfter < 0) {
    const err = new Error(`Insufficient stock for ${product.name}. Available: ${quantityBefore}.`);
    err.status = 400;
    throw err;
  }

  const costPerUnit = roundUgx(product.buying_price);
  const amount = roundUgx(costPerUnit * qty);
  const adjustmentId = newId('adj');

  await tx
    .prepare(
      `
      UPDATE products SET
        current_stock = ?,
        updated_at = datetime('now'),
        sync_status = 'pending'
      WHERE id = ? AND business_id = ?
    `
    )
    .run(quantityAfter, productId, businessId);

  await tx
    .prepare(
      `
      INSERT INTO stock_adjustments (
        id, product_id, user_id, adjustment_type, quantity_before, quantity_change,
        quantity_after, reason, cost_per_unit, business_id, created_at, sync_status
      ) VALUES (?, ?, ?, 'usage', ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
    `
    )
    .run(
      adjustmentId,
      productId,
      userId,
      quantityBefore,
      -qty,
      quantityAfter,
      reason || `Stock expense ${expenseId}`,
      costPerUnit,
      businessId
    );

  return {
    amount,
    adjustmentId,
    productName: product.name,
    costPerUnit,
  };
}

async function restoreStockForExpense(tx, expense, userId, businessId) {
  if (expense.expense_type !== 'stock_usage' || !expense.product_id || !expense.quantity) {
    return;
  }

  const product = await getProductForExpense(tx, expense.product_id, businessId);
  if (!product) return;

  const qty = Number(expense.quantity);
  const quantityBefore = Number(product.current_stock) || 0;
  const quantityAfter = quantityBefore + qty;

  await tx
    .prepare(
      `
      UPDATE products SET
        current_stock = ?,
        updated_at = datetime('now'),
        sync_status = 'pending'
      WHERE id = ? AND business_id = ?
    `
    )
    .run(quantityAfter, expense.product_id, businessId);

  await tx
    .prepare(
      `
      INSERT INTO stock_adjustments (
        id, product_id, user_id, adjustment_type, quantity_before, quantity_change,
        quantity_after, reason, cost_per_unit, business_id, created_at, sync_status
      ) VALUES (?, ?, ?, 'correction', ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
    `
    )
    .run(
      newId('adj'),
      expense.product_id,
      userId,
      quantityBefore,
      qty,
      quantityAfter,
      `Reversal of stock expense ${expense.id}`,
      roundUgx(product.buying_price),
      businessId
    );
}

// List expenses (filters: date, from, to, category, expense_type, page, limit)
router.get('/', checkPermission('view_expenses'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      date,
      from,
      to,
      category,
      expense_type,
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

    if (expense_type && EXPENSE_TYPES.includes(expense_type)) {
      where += ` AND COALESCE(e.expense_type, 'cash_out') = ?`;
      params.push(expense_type);
    }

    if (search) {
      where += ` AND (e.title ILIKE ? OR e.notes ILIKE ? OR e.receipt_ref ILIKE ? OR p.name ILIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    const { total } = await db
      .prepare(
        `
      SELECT COUNT(*) as total
      FROM expenses e
      LEFT JOIN products p ON p.id = e.product_id
      WHERE ${where}
    `
      )
      .get(...params);

    const listParams = [...params, parseInt(limit, 10), offset];
    const expenses = await db
      .prepare(
        `
      SELECT e.*, u.name as recorded_by_name, p.name as product_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN products p ON p.id = e.product_id
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
  res.json({
    categories: EXPENSE_CATEGORIES,
    recordable_categories: recordableCategoriesForUser(req.user),
    manager_only_categories: MANAGER_ONLY_CATEGORIES,
    payment_methods: PAYMENT_METHODS,
    expense_types: EXPENSE_TYPES,
  });
});

router.get('/summary/today', checkPermission('view_expenses'), async (req, res) => {
  try {
    const date = req.query.date || getStoreToday();
    const row = await db.prepare(`${EXPENSE_SUMMARY_SQL} AND expense_date = ?`).get(bid(req), date);
    const summary = mapSummaryRow(row);

    res.json({
      date,
      timezone: STORE_TZ,
      ...summary,
      net_cash_impact: summary.cash_total,
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

    const totals = mapSummaryRow(
      await db
        .prepare(`${EXPENSE_SUMMARY_SQL} AND expense_date >= ? AND expense_date <= ?`)
        .get(bid(req), from, to)
    );

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
      SELECT
        expense_date as date,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(CASE WHEN COALESCE(expense_type, 'cash_out') = 'cash_out' THEN amount ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN expense_type = 'stock_usage' THEN amount ELSE 0 END), 0) as stock_total
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
      ...totals,
      net_cash_impact: totals.cash_total,
      by_category: byCategory.map((r) => ({
        category: r.category,
        count: Number(r.count),
        total: Number(r.total),
      })),
      by_day: byDay.map((r) => ({
        date: r.date,
        count: Number(r.count),
        total: Number(r.total),
        cash_total: Number(r.cash_total),
        stock_total: Number(r.stock_total),
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
      SELECT e.*, u.name as recorded_by_name, p.name as product_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN products p ON p.id = e.product_id
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
      expense_type = 'cash_out',
      product_id,
      quantity,
      notes,
      receipt_ref,
    } = req.body;

    const type = normalizeExpenseType(expense_type);
    const cat = EXPENSE_CATEGORIES.includes(category) ? category : 'other';
    assertCashierCanUseCategory(req.user, cat);
    const dateStr = expense_date || getStoreToday();
    const expenseId = newId('exp');

    let finalTitle = String(title || '').trim();
    let finalAmount = Number(amount);
    let finalPayment = PAYMENT_METHODS.includes(payment_method) ? payment_method : 'cash';
    let productId = product_id || null;
    let qty = quantity != null ? Number(quantity) : null;
    let stockAdjustmentId = null;

    if (type === 'stock_usage') {
      if (!product_id) {
        return res.status(400).json({ error: 'Select a product for stock usage.' });
      }

      await db.transaction(async (tx) => {
        const stockResult = await deductStockForExpense(tx, {
          productId: product_id,
          quantity,
          userId: req.user.id,
          businessId: bid(req),
          reason: notes || finalTitle || `Stock used — expense ${expenseId}`,
          expenseId,
        });

        finalAmount = stockResult.amount;
        stockAdjustmentId = stockResult.adjustmentId;
        productId = product_id;
        qty = Number(quantity);
        finalPayment = 'other';

        if (!finalTitle) {
          finalTitle = `${qty} × ${stockResult.productName}`;
        }

        await tx
          .prepare(
            `
          INSERT INTO expenses (
            id, business_id, user_id, title, category, amount, payment_method,
            expense_date, notes, receipt_ref, expense_type, product_id, quantity,
            stock_adjustment_id, created_at, updated_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')
        `
          )
          .run(
            expenseId,
            bid(req),
            req.user.id,
            finalTitle,
            cat,
            finalAmount,
            finalPayment,
            dateStr,
            notes || null,
            receipt_ref || null,
            type,
            productId,
            qty,
            stockAdjustmentId
          );
      });
    } else {
      if (!finalTitle) {
        return res.status(400).json({ error: 'Expense title is required.' });
      }
      if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than zero.' });
      }
      finalAmount = roundUgx(finalAmount);

      await db
        .prepare(
          `
        INSERT INTO expenses (
          id, business_id, user_id, title, category, amount, payment_method,
          expense_date, notes, receipt_ref, expense_type, created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')
      `
        )
        .run(
          expenseId,
          bid(req),
          req.user.id,
          finalTitle,
          cat,
          finalAmount,
          finalPayment,
          dateStr,
          notes || null,
          receipt_ref || null,
          type
        );
    }

    const expense = await db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(expenseId);

    notifySupervisorsOfExpense(req, 'EXPENSE_RECORDED', expense);

    res.status(201).json({
      message: type === 'stock_usage' ? 'Stock usage recorded.' : 'Expense recorded successfully.',
      expense,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to record expense.' });
  }
});

router.put('/:id', checkPermission('manage_expenses'), async (req, res) => {
  try {
    const existing = await db
      .prepare(`SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existing) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    const existingType = normalizeExpenseType(existing.expense_type);

    if (existingType === 'stock_usage') {
      return res.status(400).json({
        error: 'Stock usage records cannot be edited. Remove and record again if needed.',
      });
    }

    try {
      assertCashierCanUseCategory(req.user, existing.category, { existingCategory: existing.category });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      throw error;
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
      const nextCategory = EXPENSE_CATEGORIES.includes(category) ? category : 'other';
      try {
        assertCashierCanUseCategory(req.user, nextCategory, { existingCategory: existing.category });
      } catch (error) {
        if (error.status) {
          return res.status(error.status).json({ error: error.message });
        }
        throw error;
      }
      updates.push('category = ?');
      params.push(nextCategory);
    }
    if (amount !== undefined) {
      const amt = roundUgx(amount);
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
      .prepare(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ? AND business_id = ?`)
      .run(...params);

    const expense = await db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(req.params.id);

    notifySupervisorsOfExpense(req, 'EXPENSE_UPDATED', expense, {
      changes: describeExpenseChanges(existing, req.body),
    });

    res.json({ message: 'Expense updated successfully.', expense });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update expense.' });
  }
});

router.delete('/:id', checkPermission('manage_expenses'), async (req, res) => {
  try {
    const existing = await db
      .prepare(`SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existing) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    try {
      assertCashierCanUseCategory(req.user, existing.category, { existingCategory: existing.category });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      throw error;
    }

    await db.transaction(async (tx) => {
      await restoreStockForExpense(tx, existing, req.user.id, bid(req));
      await tx
        .prepare(
          `UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now'), sync_status = 'pending' WHERE id = ? AND business_id = ?`
        )
        .run(req.params.id, bid(req));
    });

    notifySupervisorsOfExpense(req, 'EXPENSE_DELETED', existing);

    res.json({ message: 'Expense removed successfully.' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense.' });
  }
});

module.exports = router;
