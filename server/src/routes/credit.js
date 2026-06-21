const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const { roundUgx } = require('../utils/money');
const { dispatch } = require('./notifications');
const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const bid = (req) => req.user.business_id;

// Outstanding receivables list
router.get('/receivables', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { status, customer_id, overdue_only } = req.query;
    let query = `
      SELECT s.*, c.name as customer_name, c.phone as customer_phone,
             u.name as cashier_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.deleted_at IS NULL AND s.business_id = ?
        AND s.status = 'completed'
        AND s.balance_due > 0
    `;
    const params = [bid(req)];

    if (status) {
      query += ` AND s.payment_status = ?`;
      params.push(status);
    }
    if (customer_id) {
      query += ` AND s.customer_id = ?`;
      params.push(customer_id);
    }
    if (overdue_only === 'true') {
      query += ` AND s.credit_due_date IS NOT NULL AND date(s.credit_due_date) < date('now')`;
    }

    query += ` ORDER BY s.credit_due_date ASC NULLS LAST, s.created_at DESC`;

    const receivables = await db.prepare(query).all(...params);

    const totalOutstanding = receivables.reduce((sum, r) => sum + (Number(r.balance_due) || 0), 0);

    res.json({ receivables, totalOutstanding: roundUgx(totalOutstanding) });
  } catch (error) {
    console.error('Get receivables error:', error);
    res.status(500).json({ error: 'Failed to fetch receivables.' });
  }
});

// Aging summary
router.get('/aging', authorize('admin', 'manager'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT
        s.id, s.sale_number, s.balance_due, s.credit_due_date, s.created_at,
        c.name as customer_name, c.phone as customer_phone,
        CASE
          WHEN s.credit_due_date IS NULL THEN 'no_due_date'
          WHEN date(s.credit_due_date) >= date('now') THEN 'current'
          WHEN date(s.credit_due_date) >= date('now', '-7 days') THEN '1_7_days'
          WHEN date(s.credit_due_date) >= date('now', '-30 days') THEN '8_30_days'
          ELSE 'over_30_days'
        END as bucket
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.deleted_at IS NULL AND s.business_id = ?
        AND s.status = 'completed' AND s.balance_due > 0
      ORDER BY s.credit_due_date ASC NULLS LAST
    `).all(bid(req));

    const buckets = {
      current: { count: 0, amount: 0, items: [] },
      '1_7_days': { count: 0, amount: 0, items: [] },
      '8_30_days': { count: 0, amount: 0, items: [] },
      over_30_days: { count: 0, amount: 0, items: [] },
      no_due_date: { count: 0, amount: 0, items: [] },
    };

    for (const row of rows) {
      const b = buckets[row.bucket] || buckets.no_due_date;
      const amt = Number(row.balance_due) || 0;
      b.count += 1;
      b.amount += amt;
      b.items.push(row);
    }

    for (const key of Object.keys(buckets)) {
      buckets[key].amount = roundUgx(buckets[key].amount);
    }

    res.json({ aging: buckets, totalOutstanding: roundUgx(rows.reduce((s, r) => s + (Number(r.balance_due) || 0), 0)) });
  } catch (error) {
    console.error('Get aging error:', error);
    res.status(500).json({ error: 'Failed to fetch aging report.' });
  }
});

// Summary stats
router.get('/summary', authorize('admin', 'manager'), async (req, res) => {
  try {
    const stats = await db.prepare(`
      SELECT
        COUNT(*) as open_count,
        COALESCE(SUM(balance_due), 0) as total_outstanding,
        COUNT(CASE WHEN credit_due_date IS NOT NULL AND date(credit_due_date) < date('now') THEN 1 END) as overdue_count,
        COALESCE(SUM(CASE WHEN credit_due_date IS NOT NULL AND date(credit_due_date) < date('now') THEN balance_due ELSE 0 END), 0) as overdue_amount
      FROM sales
      WHERE deleted_at IS NULL AND business_id = ?
        AND status = 'completed' AND balance_due > 0
    `).get(bid(req));

    const customersWithCredit = await db.prepare(`
      SELECT COUNT(*) as count FROM customers
      WHERE deleted_at IS NULL AND business_id = ? AND credit_enabled = 1
    `).get(bid(req));

    res.json({
      openCount: stats.open_count || 0,
      totalOutstanding: roundUgx(stats.total_outstanding || 0),
      overdueCount: stats.overdue_count || 0,
      overdueAmount: roundUgx(stats.overdue_amount || 0),
      creditCustomers: customersWithCredit.count || 0,
    });
  } catch (error) {
    console.error('Get credit summary error:', error);
    res.status(500).json({ error: 'Failed to fetch credit summary.' });
  }
});

// Payment history
router.get('/payments', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { customer_id, sale_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT cp.*, c.name as customer_name, s.sale_number, u.name as recorded_by_name
      FROM customer_payments cp
      LEFT JOIN customers c ON cp.customer_id = c.id
      LEFT JOIN sales s ON cp.sale_id = s.id
      LEFT JOIN users u ON cp.recorded_by = u.id
      WHERE cp.business_id = ?
    `;
    const params = [bid(req)];

    if (customer_id) {
      query += ` AND cp.customer_id = ?`;
      params.push(customer_id);
    }
    if (sale_id) {
      query += ` AND cp.sale_id = ?`;
      params.push(sale_id);
    }

    query += ` ORDER BY cp.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), offset);

    const payments = await db.prepare(query).all(...params);
    res.json({ payments });
  } catch (error) {
    console.error('Get credit payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payment history.' });
  }
});

// Record payment against a credit sale
router.post('/payments', authorize('admin', 'manager'), async (req, res) => {
  try {
    const {
      sale_id,
      customer_id,
      amount,
      payment_method = 'cash',
      payment_reference,
      notes,
    } = req.body;

    const payAmount = roundUgx(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    }

    const validMethods = ['cash', 'mtn_momo', 'airtel_money', 'bank', 'other'];
    const method = validMethods.includes(payment_method) ? payment_method : 'cash';

    let sale = null;
    let custId = customer_id;

    if (sale_id) {
      sale = await db.prepare(`
        SELECT s.*, c.name as customer_name, c.phone as customer_phone
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.id = ? AND s.deleted_at IS NULL AND s.business_id = ? AND s.status = 'completed'
      `).get(sale_id, bid(req));

      if (!sale) {
        return res.status(404).json({ error: 'Sale not found.' });
      }
      if (!sale.customer_id) {
        return res.status(400).json({ error: 'This sale has no customer for credit payment.' });
      }
      if (Number(sale.balance_due) <= 0) {
        return res.status(400).json({ error: 'This sale has no outstanding balance.' });
      }
      if (payAmount > roundUgx(sale.balance_due) + 0.01) {
        return res.status(400).json({ error: `Payment exceeds balance due (UGX ${roundUgx(sale.balance_due).toLocaleString()}).` });
      }
      custId = sale.customer_id;
    } else if (!custId) {
      return res.status(400).json({ error: 'Specify sale_id or customer_id.' });
    }

    const customer = await db.prepare(`
      SELECT id, name, phone, credit_balance FROM customers
      WHERE id = ? AND deleted_at IS NULL AND business_id = ?
    `).get(custId, bid(req));

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const paymentId = newId('cpay');
    let newBalanceDue = 0;
    let newPaymentStatus = 'paid';

    await db.transaction(async (tx) => {
      await tx.prepare(`
        INSERT INTO customer_payments (
          id, customer_id, sale_id, amount, payment_method, payment_reference,
          notes, recorded_by, business_id, created_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
      `).run(
        paymentId, custId, sale_id || null, payAmount, method,
        payment_reference || null, notes || null, req.user.id, bid(req)
      );

      if (sale) {
        newBalanceDue = roundUgx(Number(sale.balance_due) - payAmount);
        newPaymentStatus = newBalanceDue <= 0 ? 'paid' : 'partial';
        const newAmountPaid = roundUgx(Number(sale.amount_paid) + payAmount);

        await tx.prepare(`
          UPDATE sales SET
            balance_due = ?,
            payment_status = ?,
            amount_paid = ?,
            updated_at = datetime('now'),
            sync_status = 'pending'
          WHERE id = ? AND business_id = ?
        `).run(newBalanceDue, newPaymentStatus, newAmountPaid, sale.id, bid(req));
      }

      await tx.prepare(`
        UPDATE customers SET
          credit_balance = GREATEST(0, credit_balance - ?),
          updated_at = datetime('now'),
          sync_status = 'pending'
        WHERE id = ? AND business_id = ?
      `).run(payAmount, custId, bid(req));
    });

    dispatch(
      'CREDIT_PAYMENT_RECEIVED',
      {
        customer_name: customer.name,
        amount: payAmount,
        sale_number: sale?.sale_number || 'Account payment',
        balance_due: newBalanceDue,
        recorded_by: req.user.name,
      },
      { business_id: bid(req) }
    );

    res.status(201).json({
      message: 'Payment recorded successfully.',
      paymentId,
      balanceDue: newBalanceDue,
      paymentStatus: newPaymentStatus,
    });
  } catch (error) {
    console.error('Record credit payment error:', error);
    res.status(500).json({ error: 'Failed to record payment.' });
  }
});

module.exports = router;
