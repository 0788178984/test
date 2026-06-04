const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const { roundUgx } = require('../utils/money');
const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const bid = (req) => req.user.business_id;

router.get('/low-stock', checkPermission('view_inventory'), async (req, res) => {
  try {
    const lowStockItems = await db
      .prepare(
        `
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.current_stock <= p.minimum_stock
      AND p.is_active = 1
      AND p.deleted_at IS NULL
      AND p.business_id = ?
      ORDER BY p.current_stock ASC
    `
      )
      .all(bid(req));

    res.json({ lowStockItems });
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items.' });
  }
});

router.get('/expiring', checkPermission('view_inventory'), async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const expiringProducts = await db
      .prepare(
        `
      SELECT p.*, s.name as supplier_name,
        CASE
          WHEN date(p.expiry_date) < date('now') THEN 'expired'
          WHEN date(p.expiry_date) <= date('now', '+7 days') THEN 'critical'
          WHEN date(p.expiry_date) <= date('now', '+30 days') THEN 'warning'
          ELSE 'ok'
        END as expiry_status
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.expiry_date IS NOT NULL
      AND p.current_stock > 0
      AND date(p.expiry_date) <= date('now', '+' || ? || ' days')
      AND p.deleted_at IS NULL
      AND p.business_id = ?
      ORDER BY p.expiry_date ASC
    `
      )
      .all(String(days), bid(req));

    res.json({ expiringProducts });
  } catch (error) {
    console.error('Get expiring products error:', error);
    res.status(500).json({ error: 'Failed to fetch expiring products.' });
  }
});

router.get('/adjustments', checkPermission('view_inventory'), async (req, res) => {
  try {
    const { page = 1, limit = 50, product_id, adjustment_type, from, to } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT sa.*, p.name as product_name, p.sku, u.name as user_name, s.name as supplier_name
      FROM stock_adjustments sa
      JOIN products p ON sa.product_id = p.id
      JOIN users u ON sa.user_id = u.id
      LEFT JOIN suppliers s ON sa.supplier_id = s.id
      WHERE p.deleted_at IS NULL AND sa.business_id = ?
    `;
    const params = [bid(req)];

    if (product_id) {
      query += ` AND sa.product_id = ?`;
      params.push(product_id);
    }

    if (adjustment_type) {
      query += ` AND sa.adjustment_type = ?`;
      params.push(adjustment_type);
    }

    if (from) {
      query += ` AND date(sa.created_at) >= date(?)`;
      params.push(from);
    }

    if (to) {
      query += ` AND date(sa.created_at) <= date(?)`;
      params.push(to);
    }

    query += ` ORDER BY sa.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), offset);

    const adjustments = await db.prepare(query).all(...params);

    let countQuery = `
      SELECT COUNT(*) as total
      FROM stock_adjustments sa
      JOIN products p ON sa.product_id = p.id
      WHERE p.deleted_at IS NULL AND sa.business_id = ?
    `;
    const countParams = [bid(req)];

    if (product_id) {
      countQuery += ` AND sa.product_id = ?`;
      countParams.push(product_id);
    }

    if (adjustment_type) {
      countQuery += ` AND sa.adjustment_type = ?`;
      countParams.push(adjustment_type);
    }

    if (from) {
      countQuery += ` AND date(sa.created_at) >= date(?)`;
      countParams.push(from);
    }

    if (to) {
      countQuery += ` AND date(sa.created_at) <= date(?)`;
      countParams.push(to);
    }

    const { total } = await db.prepare(countQuery).get(...countParams);

    res.json({
      adjustments,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get stock adjustments error:', error);
    res.status(500).json({ error: 'Failed to fetch stock adjustments.' });
  }
});

router.post('/restock', checkPermission('adjust_stock'), async (req, res) => {
  try {
    const { product_id, quantity, cost_per_unit, supplier_id, reason } = req.body;

    if (!product_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Product ID and positive quantity are required.' });
    }

    const product = await db
      .prepare(`SELECT current_stock FROM products WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(product_id, bid(req));

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const quantityBefore = product.current_stock;
    const quantityAfter = quantityBefore + parseFloat(quantity);

    await db.transaction(async (tx) => {
      await tx.prepare(
        `
        UPDATE products SET
          current_stock = ?,
          updated_at = datetime('now'),
          sync_status = 'pending'
        WHERE id = ? AND business_id = ?
      `
      ).run(quantityAfter, product_id, bid(req));

      await tx.prepare(
        `
        INSERT INTO stock_adjustments (
          id, product_id, user_id, adjustment_type, quantity_before, quantity_change,
          quantity_after, reason, supplier_id, cost_per_unit, business_id, created_at, sync_status
        ) VALUES (?, ?, ?, 'restock', ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
      `
      ).run(
        newId('adj'),
        product_id,
        req.user.id,
        quantityBefore,
        quantity,
        quantityAfter,
        reason || 'Restock',
        supplier_id,
        cost_per_unit,
        bid(req)
      );
    });

    res.json({
      message: 'Product restocked successfully.',
      newStock: quantityAfter,
    });
  } catch (error) {
    console.error('Restock error:', error);
    res.status(500).json({ error: 'Failed to restock product.' });
  }
});

router.get('/summary', checkPermission('view_inventory'), async (req, res) => {
  try {
    const businessId = bid(req);
    const raw = await db
      .prepare(
        `
      SELECT
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_products,
        COUNT(CASE WHEN is_active = 1 AND current_stock > 0 THEN 1 END) as in_stock_products,
        COALESCE(SUM(CASE WHEN is_active = 1 THEN current_stock ELSE 0 END), 0) as total_units,
        COUNT(CASE WHEN is_active = 1 AND current_stock <= minimum_stock THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) < date('now') AND current_stock > 0 THEN 1 END) as expired_count,
        COUNT(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) <= date('now', '+30 days') AND date(expiry_date) >= date('now') AND current_stock > 0 THEN 1 END) as expiring_soon_count,
        COALESCE(SUM(CASE WHEN is_active = 1 THEN current_stock * buying_price ELSE 0 END), 0) as stock_value_at_cost,
        COALESCE(SUM(CASE WHEN is_active = 1 THEN current_stock * selling_price ELSE 0 END), 0) as stock_value_at_selling
      FROM products
      WHERE deleted_at IS NULL AND business_id = ?
    `
      )
      .get(businessId);

    const stockExpenditure = roundUgx(raw.stock_value_at_cost);
    const potentialRevenue = roundUgx(raw.stock_value_at_selling);
    const projectedProfit = Math.max(0, potentialRevenue - stockExpenditure);
    const projectedMarginPercent =
      potentialRevenue > 0 ? Math.round((projectedProfit / potentialRevenue) * 1000) / 10 : 0;

    const purchaseRow = await db
      .prepare(
        `
      SELECT COALESCE(SUM(
        CASE WHEN sa.quantity_change > 0 THEN
          sa.quantity_change * COALESCE(NULLIF(sa.cost_per_unit, 0), p.buying_price, 0)
        ELSE 0 END
      ), 0) as lifetime_purchase_expenditure
      FROM stock_adjustments sa
      JOIN products p ON sa.product_id = p.id
      WHERE sa.business_id = ? AND p.deleted_at IS NULL
    `
      )
      .get(businessId);

    const summary = {
      ...raw,
      stock_value_at_cost: stockExpenditure,
      stock_value_at_selling: potentialRevenue,
      stock_expenditure: stockExpenditure,
      potential_sales_revenue: potentialRevenue,
      projected_profit_if_sold: projectedProfit,
      projected_margin_percent: projectedMarginPercent,
      lifetime_purchase_expenditure: roundUgx(purchaseRow?.lifetime_purchase_expenditure),
    };

    const categoryBreakdown = await db
      .prepare(
        `
      SELECT
        category,
        COUNT(*) as product_count,
        COALESCE(SUM(current_stock), 0) as total_units,
        COALESCE(SUM(current_stock * buying_price), 0) as cost_value,
        COALESCE(SUM(current_stock * selling_price), 0) as sell_value
      FROM products
      WHERE deleted_at IS NULL AND is_active = 1 AND current_stock > 0 AND business_id = ?
      GROUP BY category
      ORDER BY sell_value DESC
      LIMIT 15
    `
      )
      .all(businessId);

    const productValuation = await db
      .prepare(
        `
      SELECT
        id,
        name,
        category,
        unit,
        current_stock,
        buying_price,
        selling_price,
        current_stock * buying_price as cost_value,
        current_stock * selling_price as sell_value,
        current_stock * (selling_price - buying_price) as profit_value
      FROM products
      WHERE deleted_at IS NULL AND is_active = 1 AND current_stock > 0 AND business_id = ?
      ORDER BY sell_value DESC
      LIMIT 40
    `
      )
      .all(businessId);

    res.json({
      summary,
      categoryBreakdown: categoryBreakdown.map((row) => ({
        ...row,
        cost_value: roundUgx(row.cost_value),
        sell_value: roundUgx(row.sell_value),
        profit_value: Math.max(0, roundUgx(row.sell_value) - roundUgx(row.cost_value)),
      })),
      productValuation: productValuation.map((row) => ({
        ...row,
        cost_value: roundUgx(row.cost_value),
        sell_value: roundUgx(row.sell_value),
        profit_value: roundUgx(row.profit_value),
      })),
    });
  } catch (error) {
    console.error('Get inventory summary error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory summary.' });
  }
});

router.get('/movements/:product_id', checkPermission('view_inventory'), async (req, res) => {
  try {
    const { product_id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const product = await db
      .prepare(`SELECT id, name FROM products WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(product_id, bid(req));

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const adjustments = await db
      .prepare(
        `
      SELECT sa.*, u.name as user_name, s.name as supplier_name
      FROM stock_adjustments sa
      JOIN users u ON sa.user_id = u.id
      LEFT JOIN suppliers s ON sa.supplier_id = s.id
      WHERE sa.product_id = ? AND sa.business_id = ?
      ORDER BY sa.created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(product_id, bid(req), parseInt(limit, 10), offset);

    const sales = await db
      .prepare(
        `
      SELECT si.*, s.sale_number, s.created_at as sale_date, u.name as cashier_name
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN users u ON s.cashier_id = u.id
      WHERE si.product_id = ? AND s.status = 'completed' AND s.deleted_at IS NULL AND s.business_id = ?
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(product_id, bid(req), parseInt(limit, 10), offset);

    const adjustmentCount = await db
      .prepare(`SELECT COUNT(*) as total FROM stock_adjustments WHERE product_id = ? AND business_id = ?`)
      .get(product_id, bid(req)).total;

    const salesCount = await db
      .prepare(
        `
      SELECT COUNT(*) as total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE si.product_id = ? AND s.status = 'completed' AND s.deleted_at IS NULL AND s.business_id = ?
    `
      )
      .get(product_id, bid(req)).total;

    res.json({
      product,
      adjustments,
      sales,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        adjustments_total: adjustmentCount,
        sales_total: salesCount,
      },
    });
  } catch (error) {
    console.error('Get stock movements error:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements.' });
  }
});

module.exports = router;
