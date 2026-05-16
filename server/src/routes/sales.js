const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { getStoreToday, saleLocalDate } = require('../utils/storeTime');
const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

// Generate unique sale number (per business, per day)
async function generateSaleNumber(businessId) {
  const today = getStoreToday().replace(/-/g, '');
  const localDate = saleLocalDate('created_at');
  const count = (
    await db.prepare(`
    SELECT COUNT(*) as count FROM sales
    WHERE ${localDate} = ? AND business_id = ? AND deleted_at IS NULL
  `).get(getStoreToday(), businessId)
  ).count;

  return `INV-${today}-${String(Number(count) + 1).padStart(6, '0')}`;
}

// Create sale
router.post('/', checkPermission('make_sale'), async (req, res) => {
  try {
    const {
      items,
      customer_id,
      discount_amount = 0,
      discount_reason,
      payment_method,
      payment_reference,
      notes,
      amount_paid,
      change_given
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required.' });
    }

    if (!payment_method) {
      return res.status(400).json({ error: 'Payment method is required.' });
    }

    if (customer_id) {
      const cust = await db
        .prepare(`SELECT id FROM customers WHERE id = ? AND business_id = ? AND deleted_at IS NULL`)
        .get(customer_id, req.user.business_id);
      if (!cust) {
        return res.status(400).json({ error: 'Invalid customer for this store.' });
      }
    }

    // Validate items and calculate totals
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await db.prepare(`
        SELECT id, name, current_stock, buying_price, selling_price, is_active
        FROM products WHERE id = ? AND business_id = ? AND deleted_at IS NULL
      `).get(item.product_id, req.user.business_id);

      if (!product || !product.is_active) {
        return res.status(400).json({ error: `Product ${item.product_id} not found or inactive.` });
      }

      if (product.current_stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.current_stock}, Requested: ${item.quantity}` });
      }

      const lineTotal = item.quantity * product.selling_price;
      subtotal += lineTotal;

      validatedItems.push({
        ...item,
        product_name: product.name,
        unit_price: product.selling_price,
        buying_price: product.buying_price,
        line_total: lineTotal
      });
    }

    // Apply discount limits for cashiers
    if (req.user.role === 'cashier' && discount_amount > 0) {
      const maxDiscount = subtotal * 0.05; // 5% max for cashiers
      if (discount_amount > maxDiscount) {
        return res.status(400).json({ error: 'Cashiers can only apply discounts up to 5%.' });
      }
    }

    const taxAmount = (subtotal - discount_amount) * 0.18; // 18% VAT
    const totalAmount = subtotal - discount_amount + taxAmount;

    let paid = amount_paid !== undefined && amount_paid !== null ? Number(amount_paid) : totalAmount;
    let change = change_given !== undefined && change_given !== null ? Number(change_given) : 0;
    if (Number.isNaN(paid)) paid = totalAmount;
    if (Number.isNaN(change)) change = 0;
    if (payment_method === 'cash') {
      if (paid + 0.001 < totalAmount) {
        return res.status(400).json({ error: 'Amount paid must be at least the total due.' });
      }
      change = Math.max(0, paid - totalAmount);
    } else {
      paid = totalAmount;
      change = 0;
    }

    // Generate sale number
    const saleNumber = await generateSaleNumber(req.user.business_id);

    const saleId = await db.transaction(async (tx) => {
      // Create sale record
      await tx.prepare(`
        INSERT INTO sales (
          sale_number, cashier_id, customer_id, subtotal, discount_amount,
          discount_reason, tax_amount, total_amount, amount_paid, change_given,
          payment_method, payment_reference, notes, business_id, created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')
      `).run(
        saleNumber, req.user.id, customer_id || null, subtotal, discount_amount,
        discount_reason, taxAmount, totalAmount, paid, change,
        payment_method, payment_reference || null, notes || null, req.user.business_id
      );

      const insertedSale = await tx.prepare(
        `SELECT id FROM sales WHERE sale_number = ? AND business_id = ?`
      ).get(saleNumber, req.user.business_id);
      const saleId = insertedSale?.id;
      if (!saleId) {
        throw new Error('Failed to resolve sale id after insert');
      }

      // Insert sale items and update stock
      for (const item of validatedItems) {
        // Insert sale item
        await tx.prepare(`
          INSERT INTO sale_items (
            sale_id, product_id, product_name, quantity, unit_price,
            buying_price, line_total, created_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
        `).run(
          saleId, item.product_id, item.product_name, item.quantity,
          item.unit_price, item.buying_price, item.line_total
        );

        // Update product stock
        await tx.prepare(`
          UPDATE products SET 
            current_stock = current_stock - ?,
            updated_at = datetime('now'),
            sync_status = 'pending'
          WHERE id = ? AND business_id = ?
        `).run(item.quantity, item.product_id, req.user.business_id);
      }

      // Add loyalty points if customer exists
      if (customer_id) {
        const loyaltyRate = parseFloat(await tx.prepare(`
          SELECT value FROM settings WHERE key = 'loyalty_rate'
        `).get()?.value || '0.01');
        
        const pointsEarned = Math.round(totalAmount * loyaltyRate);
        
        if (pointsEarned > 0) {
          // Add loyalty transaction
          await tx.prepare(`
            INSERT INTO loyalty_transactions (
              customer_id, sale_id, points_change, reason, business_id, created_at, sync_status
            ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'pending')
          `).run(customer_id, saleId, pointsEarned, `Purchase of UGX ${totalAmount.toLocaleString()}`, req.user.business_id);

          // Update customer points and stats
          await tx.prepare(`
            UPDATE customers SET
              loyalty_points = loyalty_points + ?,
              total_spent = total_spent + ?,
              visit_count = visit_count + 1,
              last_visit = datetime('now'),
              updated_at = datetime('now'),
              sync_status = 'pending'
            WHERE id = ? AND business_id = ?
          `).run(pointsEarned, totalAmount, customer_id, req.user.business_id);
        }
      }

      return saleId;
    });

    res.status(201).json({
      message: 'Sale completed successfully.',
      saleId,
      saleNumber,
      totalAmount,
      amountPaid: paid,
      changeGiven: change
    });
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ error: 'Failed to complete sale.' });
  }
});

// Get sales with filters
router.get('/', async (req, res) => {
  try {
    const { from, to, cashier_id, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT s.*, u.name as cashier_name, c.name as customer_name, c.phone as customer_phone
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.deleted_at IS NULL AND s.business_id = ?
    `;
    const params = [req.user.business_id];
    const localDate = saleLocalDate('s.created_at');

    if (req.user.role === 'cashier') {
      const today = getStoreToday();
      if ((from && from !== today) || (to && to !== today)) {
        return res.status(403).json({ error: 'Cashiers can only view today\'s sales.' });
      }
      query += ` AND ${localDate} = ? AND s.cashier_id = ?`;
      params.push(today, req.user.id);
    } else {
      if (from) {
        query += ` AND ${localDate} >= ?`;
        params.push(from);
      }
      if (to) {
        query += ` AND ${localDate} <= ?`;
        params.push(to);
      }
      if (cashier_id) {
        query += ` AND s.cashier_id = ?`;
        params.push(cashier_id);
      }
    }

    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const sales = await db.prepare(query).all(...params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total FROM sales s WHERE s.deleted_at IS NULL AND s.business_id = ?
    `;
    const countParams = [req.user.business_id];

    if (req.user.role === 'cashier') {
      const today = getStoreToday();
      countQuery += ` AND ${localDate} = ? AND s.cashier_id = ?`;
      countParams.push(today, req.user.id);
    } else {
      if (from) {
        countQuery += ` AND ${localDate} >= ?`;
        countParams.push(from);
      }
      if (to) {
        countQuery += ` AND ${localDate} <= ?`;
        countParams.push(to);
      }
      if (cashier_id) {
        countQuery += ` AND s.cashier_id = ?`;
        countParams.push(cashier_id);
      }
    }

    if (status) {
      countQuery += ` AND s.status = ?`;
      countParams.push(status);
    }

    const { total } = await db.prepare(countQuery).get(...countParams);

    res.json({
      sales,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ error: 'Failed to fetch sales.' });
  }
});

// Must be registered before /:id — otherwise "today-summary" is captured as an id
router.get('/today-summary', async (req, res) => {
  try {
    const today = getStoreToday();
    const localDate = saleLocalDate('s.created_at');

    let query = `
      SELECT
        COUNT(*) as sales_count,
        SUM(total_amount) as revenue,
        SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price)
                           FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE ${localDate} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const params = [today, req.user.business_id];

    if (req.user.role === 'cashier') {
      query += ` AND s.cashier_id = ?`;
      params.push(req.user.id);
    }

    const summary = await db.prepare(query).get(...params);

    let topProductQuery = `
      SELECT p.name, SUM(si.quantity) as quantity_sold, SUM(si.line_total) as revenue
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      WHERE ${localDate} = ? AND s.status = 'completed' AND s.deleted_at IS NULL
      AND s.business_id = ?
    `;

    const topProductParams = [today, req.user.business_id];

    if (req.user.role === 'cashier') {
      topProductQuery += ` AND s.cashier_id = ?`;
      topProductParams.push(req.user.id);
    }

    topProductQuery += ` GROUP BY si.product_id, p.name ORDER BY quantity_sold DESC LIMIT 1`;

    const topProduct = await db.prepare(topProductQuery).get(...topProductParams);

    res.json({
      date: today,
      sales_count: summary.sales_count || 0,
      revenue: summary.revenue || 0,
      profit: summary.profit || 0,
      top_product: topProduct || null
    });
  } catch (error) {
    console.error('Get today summary error:', error);
    res.status(500).json({ error: 'Failed to fetch today summary.' });
  }
});

// Get single sale with items
router.get('/:id', async (req, res) => {
  try {
    const sale = await db.prepare(`
      SELECT s.*, u.name as cashier_name, c.name as customer_name, c.phone as customer_phone
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ? AND s.deleted_at IS NULL AND s.business_id = ?
    `).get(req.params.id, req.user.business_id);

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found.' });
    }

    if (req.user.role === 'cashier') {
      if (sale.cashier_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const today = getStoreToday();
      const onToday = await db
        .prepare(`SELECT 1 as ok FROM sales s WHERE s.id = ? AND ${saleLocalDate('s.created_at')} = ?`)
        .get(sale.id, today);
      if (!onToday) {
        return res.status(403).json({ error: 'Cashiers can only view today\'s sales.' });
      }
    }

    // Get sale items
    const items = await db.prepare(`
      SELECT * FROM sale_items WHERE sale_id = ?
    `).all(sale.id);

    res.json({ sale, items });
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ error: 'Failed to fetch sale.' });
  }
});

// Void sale
router.post('/:id/void', checkPermission('void_sale'), async (req, res) => {
  try {
    const { reason } = req.body;

    const sale = await db.prepare(`
      SELECT id, status, cashier_id FROM sales
      WHERE id = ? AND deleted_at IS NULL AND business_id = ?
    `).get(req.params.id, req.user.business_id);

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found.' });
    }

    if (sale.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed sales can be voided.' });
    }

    // Get sale items to restore stock
    const items = await db.prepare(`
      SELECT product_id, quantity FROM sale_items WHERE sale_id = ?
    `).all(sale.id);

    await db.transaction(async (tx) => {
      // Update sale status
      await tx.prepare(`
        UPDATE sales SET 
          status = 'voided',
          notes = COALESCE(notes, '') || ' | Voided: ' || COALESCE(?, 'No reason provided'),
          updated_at = datetime('now'),
          sync_status = 'pending'
        WHERE id = ? AND business_id = ?
      `).run(reason, sale.id, req.user.business_id);

      // Restore stock
      for (const item of items) {
        await tx.prepare(`
          UPDATE products SET 
            current_stock = current_stock + ?,
            updated_at = datetime('now'),
            sync_status = 'pending'
          WHERE id = ? AND business_id = ?
        `).run(item.quantity, item.product_id, req.user.business_id);
      }

      // Reverse loyalty points if customer exists
      const customerInfo = await tx.prepare(`
        SELECT customer_id, total_amount FROM sales WHERE id = ? AND business_id = ?
      `).get(sale.id, req.user.business_id);

      if (customerInfo.customer_id) {
        const loyaltyRate = parseFloat(await tx.prepare(`
          SELECT value FROM settings WHERE key = 'loyalty_rate'
        `).get()?.value || '0.01');
        
        const pointsToReverse = Math.round(customerInfo.total_amount * loyaltyRate);
        
        if (pointsToReverse > 0) {
          // Add negative loyalty transaction
          await tx.prepare(`
            INSERT INTO loyalty_transactions (
              customer_id, sale_id, points_change, reason, business_id, created_at, sync_status
            ) VALUES (?, ?, ?, ?, ?, datetime('now'), 'pending')
          `).run(customerInfo.customer_id, sale.id, -pointsToReverse, `Sale voided: ${sale.id}`, req.user.business_id);

          // Update customer points
          await tx.prepare(`
            UPDATE customers SET
              loyalty_points = loyalty_points - ?,
              total_spent = total_spent - ?,
              updated_at = datetime('now'),
              sync_status = 'pending'
            WHERE id = ? AND business_id = ?
          `).run(pointsToReverse, customerInfo.total_amount, customerInfo.customer_id, req.user.business_id);
        }
      }
    });

    res.json({ message: 'Sale voided successfully.' });
  } catch (error) {
    console.error('Void sale error:', error);
    res.status(500).json({ error: 'Failed to void sale.' });
  }
});

module.exports = router;
