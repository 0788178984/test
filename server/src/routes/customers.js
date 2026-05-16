const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const bid = (req) => req.user.business_id;

router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT * FROM customers
      WHERE deleted_at IS NULL AND business_id = ?
    `;
    const params = [bid(req)];

    if (search) {
      query += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    query += ` ORDER BY name LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), offset);

    const customers = await db.prepare(query).all(...params);

    let countQuery = `
      SELECT COUNT(*) as total FROM customers WHERE deleted_at IS NULL AND business_id = ?
    `;
    const countParams = [bid(req)];

    if (search) {
      countQuery += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
      const searchParam = `%${search}%`;
      countParams.push(searchParam, searchParam, searchParam);
    }

    const { total } = await db.prepare(countQuery).get(...countParams);

    res.json({
      customers,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers.' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const customer = await db
      .prepare(
        `SELECT id, name FROM customers WHERE id = ? AND deleted_at IS NULL AND business_id = ?`
      )
      .get(req.params.id, bid(req));

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const sales = await db
      .prepare(
        `
      SELECT s.*, u.name as cashier_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.customer_id = ? AND s.deleted_at IS NULL AND s.business_id = ?
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(req.params.id, bid(req), parseInt(limit, 10), offset);

    const { total } = await db
      .prepare(
        `
      SELECT COUNT(*) as total
      FROM sales s
      WHERE s.customer_id = ? AND s.deleted_at IS NULL AND s.business_id = ?
    `
      )
      .get(req.params.id, bid(req));

    const loyaltyTransactions = await db
      .prepare(
        `
      SELECT * FROM loyalty_transactions
      WHERE customer_id = ? AND business_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `
      )
      .all(req.params.id, bid(req));

    res.json({
      customer,
      sales,
      loyaltyTransactions,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get customer history error:', error);
    res.status(500).json({ error: 'Failed to fetch customer history.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await db
      .prepare(
        `
      SELECT * FROM customers
      WHERE id = ? AND deleted_at IS NULL AND business_id = ?
    `
      )
      .get(req.params.id, bid(req));

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    res.json({ customer });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to fetch customer.' });
  }
});

router.post('/', checkPermission('manage_customers'), async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    const customerId = newId('cust');
    await db.prepare(
      `
      INSERT INTO customers (
        id, name, phone, email, notes, business_id, created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')
    `
    ).run(customerId, name, phone, email, notes, bid(req));

    res.status(201).json({
      message: 'Customer created successfully.',
    });
  } catch (error) {
    console.error('Create customer error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return res.status(400).json({ error: 'Phone number already exists.' });
    }
    res.status(500).json({ error: 'Failed to create customer.' });
  }
});

router.put('/:id', checkPermission('manage_customers'), async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;

    const existingCustomer = await db
      .prepare(`SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    await db.prepare(
      `
      UPDATE customers SET
        name = ?, phone = ?, email = ?, notes = ?,
        updated_at = datetime('now'), sync_status = 'pending'
      WHERE id = ? AND business_id = ?
    `
    ).run(name, phone, email, notes, req.params.id, bid(req));

    res.json({ message: 'Customer updated successfully.' });
  } catch (error) {
    console.error('Update customer error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return res.status(400).json({ error: 'Phone number already exists.' });
    }
    res.status(500).json({ error: 'Failed to update customer.' });
  }
});

router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const existingCustomer = await db
      .prepare(`SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    await db.prepare(
      `UPDATE customers SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ? AND business_id = ?`
    ).run(req.params.id, bid(req));

    res.json({ message: 'Customer deleted successfully.' });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer.' });
  }
});

router.post('/:id/redeem-points', checkPermission('manage_customers'), async (req, res) => {
  try {
    const { points, reason } = req.body;

    if (!points || points <= 0) {
      return res.status(400).json({ error: 'Points to redeem must be positive.' });
    }

    const customer = await db
      .prepare(
        `
      SELECT id, name, loyalty_points FROM customers
      WHERE id = ? AND deleted_at IS NULL AND business_id = ?
    `
      )
      .get(req.params.id, bid(req));

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    if (customer.loyalty_points < points) {
      return res.status(400).json({ error: 'Insufficient loyalty points.' });
    }

    const pointValue = 10;
    const discountAmount = points * pointValue;

    await db.transaction(async (tx) => {
      await tx.prepare(
        `
        INSERT INTO loyalty_transactions (
          customer_id, points_change, reason, business_id, created_at, sync_status
        ) VALUES (?, ?, ?, ?, datetime('now'), 'pending')
      `
      ).run(req.params.id, -points, reason || `Redeemed ${points} points`, bid(req));

      await tx.prepare(
        `
        UPDATE customers SET
          loyalty_points = loyalty_points - ?,
          updated_at = datetime('now'),
          sync_status = 'pending'
        WHERE id = ? AND business_id = ?
      `
      ).run(points, req.params.id, bid(req));
    });

    res.json({
      message: 'Points redeemed successfully.',
      pointsRedeemed: points,
      remainingPoints: customer.loyalty_points - points,
      discountAmount,
    });
  } catch (error) {
    console.error('Redeem points error:', error);
    res.status(500).json({ error: 'Failed to redeem points.' });
  }
});

module.exports = router;
