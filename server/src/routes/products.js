const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const {
  normalizeBusinessType,
  getProductCategories,
  normalizeProductCategory,
} = require('../db/businessTypes');
const { assertSellingNotBelowCost, assertWholesaleNotBelowCost } = require('../utils/money');
const { buildProductSearchFilter } = require('../utils/productSearch');
const productImportService = require('../services/productImportService');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (
      name.endsWith('.xlsx') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx Excel files are supported.'));
    }
  },
});

async function businessTypeForUser(user) {
  if (!user?.business_id) return 'supermarket';
  const row = await db.prepare(`SELECT business_type FROM businesses WHERE id = ?`).get(user.business_id);
  return normalizeBusinessType(row?.business_type);
}

router.use(authenticate, restrictToBusinessStaff);

// Get all products with filters
router.get('/', async (req, res) => {
  try {
    const { search, category, low_stock, expiring, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const bid = req.user.business_id;
    if (!bid) {
      return res.status(403).json({ error: 'Store context missing.' });
    }

    let query = `
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.deleted_at IS NULL AND p.business_id = ?
    `;
    const params = [bid];

    if (search) {
      const searchFilter = buildProductSearchFilter(search, 'p');
      query += searchFilter.clause;
      params.push(...searchFilter.params);
    }

    if (category) {
      query += ` AND p.category = ?`;
      params.push(category);
    }

    if (low_stock === 'true') {
      query += ` AND p.current_stock <= p.minimum_stock`;
    }

    if (expiring === 'true') {
      query += ` AND p.expiry_date IS NOT NULL AND date(p.expiry_date) <= date('now', '+30 days')`;
    }

    query += ` ORDER BY p.name LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const products = await db.prepare(query).all(...params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE p.deleted_at IS NULL AND p.business_id = ?
    `;
    const countParams = [bid];

    if (search) {
      const searchFilter = buildProductSearchFilter(search, 'p');
      countQuery += searchFilter.clause;
      countParams.push(...searchFilter.params);
    }

    if (category) {
      countQuery += ` AND p.category = ?`;
      countParams.push(category);
    }

    if (low_stock === 'true') {
      countQuery += ` AND p.current_stock <= p.minimum_stock`;
    }

    if (expiring === 'true') {
      countQuery += ` AND p.expiry_date IS NOT NULL AND date(p.expiry_date) <= date('now', '+30 days')`;
    }

    const { total } = await db.prepare(countQuery).get(...countParams);

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

// Static paths must be registered before /:id

router.get('/categories/list', async (req, res) => {
  try {
    const businessType = await businessTypeForUser(req.user);
    const predefined = getProductCategories(businessType);

    const usedRows = await db.prepare(`
      SELECT DISTINCT category 
      FROM products 
      WHERE category IS NOT NULL AND deleted_at IS NULL AND business_id = ?
      ORDER BY category
    `).all(req.user.business_id);

    const used = usedRows.map((c) => c.category).filter(Boolean);
    const categories = [...new Set([...predefined, ...used])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    res.json({
      categories,
      predefined,
      business_type: businessType,
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

router.get('/import/template', checkPermission('add_edit_products'), async (req, res) => {
  try {
    const businessType = await businessTypeForUser(req.user);
    const buffer = await productImportService.buildTemplateBuffer(businessType);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="product_import_template.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Product import template error:', error);
    res.status(500).json({ error: 'Failed to generate import template.' });
  }
});

router.post('/import', checkPermission('add_edit_products'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Upload an Excel (.xlsx) file.' });
    }

    const businessType = await businessTypeForUser(req.user);
    const rows = await productImportService.parseWorkbook(req.file.buffer);
    if (rows.length === 0) {
      return res.status(400).json({
        error: 'No product rows found. Fill the Products sheet (delete the sample row if unused).',
      });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ error: 'Maximum 2,000 products per import. Split into smaller files.' });
    }

    const results = await productImportService.importProducts(rows, {
      businessId: req.user.business_id,
      businessType,
      userId: req.user.id,
    });

    res.json({
      message: `Import finished: ${results.created} created, ${results.skipped} skipped.`,
      ...results,
    });
  } catch (error) {
    console.error('Product import error:', error);
    res.status(400).json({ error: error.message || 'Import failed.' });
  }
});

router.get('/barcode/:code', async (req, res) => {
  try {
    const product = await db.prepare(`
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE lower(trim(p.barcode)) = lower(trim(?))
        AND p.business_id = ? AND p.deleted_at IS NULL AND p.is_active = 1
    `).get(req.params.code, req.user.business_id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await db.prepare(`
      SELECT p.*, s.name as supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ? AND p.business_id = ? AND p.deleted_at IS NULL
    `).get(req.params.id, req.user.business_id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
});

// Create product
router.post('/', checkPermission('add_edit_products'), async (req, res) => {
  try {
    const bid = req.user.business_id;
    if (!bid) {
      return res.status(403).json({ error: 'Store context missing.' });
    }

    const {
      name, barcode, sku, category, unit, buying_price, selling_price, wholesale_price,
      tax_rate, current_stock, minimum_stock, supplier_id, expiry_date
    } = req.body;

    if (!name || buying_price === undefined || selling_price === undefined) {
      return res.status(400).json({ error: 'Name, buying price, and selling price are required.' });
    }

    const priceCheck = assertSellingNotBelowCost(buying_price, selling_price);
    if (!priceCheck.ok) {
      return res.status(400).json({ error: priceCheck.error });
    }

    const wholesaleCheck = assertWholesaleNotBelowCost(priceCheck.buy, wholesale_price);
    if (!wholesaleCheck.ok) {
      return res.status(400).json({ error: wholesaleCheck.error });
    }

    const businessType = await businessTypeForUser(req.user);
    const normalizedCategory = normalizeProductCategory(category, businessType);
    if (category !== undefined && category !== null && String(category).trim() && !normalizedCategory) {
      return res.status(400).json({
        error: `Invalid category. Use one of: ${getProductCategories(businessType).join(', ')}.`,
      });
    }

    const productId = newId('prod');
    const openingQty = Math.max(0, Number(current_stock) || 0);
    const result = await db.prepare(`
      INSERT INTO products (
        id, name, barcode, sku, category, unit, buying_price, selling_price, wholesale_price,
        tax_rate, current_stock, minimum_stock, supplier_id, expiry_date, business_id,
        created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')
    `).run(
      productId, name, barcode, sku, normalizedCategory, unit || 'piece', priceCheck.buy, priceCheck.sell,
      wholesaleCheck.wholesale,
      tax_rate ?? 0, openingQty, minimum_stock || 5, supplier_id, expiry_date,
      bid
    );

    if (openingQty > 0) {
      await db.prepare(
        `
        INSERT INTO stock_adjustments (
          id, product_id, user_id, adjustment_type, quantity_before, quantity_change,
          quantity_after, reason, supplier_id, cost_per_unit, business_id, created_at, sync_status
        ) VALUES (?, ?, ?, 'opening', 0, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
      `
      ).run(
        newId('adj'),
        productId,
        req.user.id,
        openingQty,
        openingQty,
        'Initial stock on product create',
        supplier_id || null,
        priceCheck.buy,
        req.user.business_id
      );
    }

    res.status(201).json({
      message: 'Product created successfully.',
      productId: result.lastInsertRowid || productId,
    });
  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return res.status(400).json({ error: 'Barcode or SKU already exists.' });
    }
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

// Update product
router.put('/:id', checkPermission('add_edit_products'), async (req, res) => {
  try {
    const {
      name, barcode, sku, category, unit, buying_price, selling_price, wholesale_price,
      tax_rate, minimum_stock, supplier_id, expiry_date, is_active,
      stock_to_add, set_stock,
    } = req.body;

    const existingProduct = await db.prepare(`
      SELECT id, category, current_stock, buying_price, selling_price, wholesale_price FROM products WHERE id = ? AND business_id = ? AND deleted_at IS NULL
    `).get(req.params.id, req.user.business_id);

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const buyForChecks =
      buying_price !== undefined && buying_price !== null
        ? buying_price
        : existingProduct.buying_price;

    if (buying_price !== undefined && selling_price !== undefined) {
      const priceCheck = assertSellingNotBelowCost(buying_price, selling_price);
      if (!priceCheck.ok) {
        return res.status(400).json({ error: priceCheck.error });
      }
    }

    if (wholesale_price !== undefined) {
      const wholesaleCheck = assertWholesaleNotBelowCost(buyForChecks, wholesale_price);
      if (!wholesaleCheck.ok) {
        return res.status(400).json({ error: wholesaleCheck.error });
      }
    }

    const wholesaleToSave =
      wholesale_price !== undefined
        ? wholesale_price === null || String(wholesale_price).trim() === ''
          ? null
          : assertWholesaleNotBelowCost(buyForChecks, wholesale_price).wholesale
        : existingProduct.wholesale_price;

    const businessType = await businessTypeForUser(req.user);
    let categoryToSave = existingProduct.category;
    if (category !== undefined) {
      const normalizedCategory = normalizeProductCategory(category, businessType);
      if (category !== null && String(category).trim() && !normalizedCategory) {
        return res.status(400).json({
          error: `Invalid category. Use one of: ${getProductCategories(businessType).join(', ')}.`,
        });
      }
      categoryToSave = normalizedCategory;
    }

    const addQty = Math.max(0, Number(stock_to_add) || 0);
    const setStockRaw = set_stock;
    const hasSetStock =
      setStockRaw !== undefined &&
      setStockRaw !== null &&
      String(setStockRaw).trim() !== '' &&
      Number.isFinite(Number(setStockRaw));
    let stockAfterUpdate = Number(existingProduct.current_stock) || 0;

    await db.transaction(async (tx) => {
      await tx.prepare(`
        UPDATE products SET
          name = ?, barcode = ?, sku = ?, category = ?, unit = ?,
          buying_price = ?, selling_price = ?, wholesale_price = ?, tax_rate = ?,
          minimum_stock = ?, supplier_id = ?, expiry_date = ?,
          is_active = ?, updated_at = datetime('now'), sync_status = 'pending'
        WHERE id = ? AND business_id = ?
      `).run(
        name,
        barcode,
        sku,
        categoryToSave,
        unit,
        buying_price,
        selling_price,
        wholesaleToSave,
        tax_rate,
        minimum_stock,
        supplier_id,
        expiry_date,
        is_active ? 1 : 0,
        req.params.id,
        req.user.business_id
      );

      const unitCost =
        buying_price !== undefined && buying_price !== null
          ? Number(buying_price)
          : Number(existingProduct.buying_price) || 0;

      if (hasSetStock) {
        const newStock = Math.max(0, Number(setStockRaw));
        const quantityBefore = stockAfterUpdate;
        const delta = newStock - quantityBefore;
        if (delta !== 0) {
          stockAfterUpdate = newStock;
          await tx.prepare(`
            UPDATE products SET
              current_stock = ?,
              updated_at = datetime('now'),
              sync_status = 'pending'
            WHERE id = ? AND business_id = ?
          `).run(stockAfterUpdate, req.params.id, req.user.business_id);

          await tx.prepare(`
            INSERT INTO stock_adjustments (
              id, product_id, user_id, adjustment_type, quantity_before, quantity_change,
              quantity_after, reason, supplier_id, cost_per_unit, business_id, created_at, sync_status
            ) VALUES (?, ?, ?, 'correction', ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
          `).run(
            newId('adj'),
            req.params.id,
            req.user.id,
            quantityBefore,
            delta,
            stockAfterUpdate,
            'Stock count corrected',
            supplier_id || null,
            unitCost,
            req.user.business_id
          );
        }
      }
      if (!hasSetStock || Math.abs(Number(setStockRaw) - (Number(existingProduct.current_stock) || 0)) < 1e-9) {
        if (addQty > 0) {
          const quantityBefore = stockAfterUpdate;
          stockAfterUpdate = quantityBefore + addQty;

          await tx.prepare(`
            UPDATE products SET
              current_stock = ?,
              updated_at = datetime('now'),
              sync_status = 'pending'
            WHERE id = ? AND business_id = ?
          `).run(stockAfterUpdate, req.params.id, req.user.business_id);

          await tx.prepare(`
            INSERT INTO stock_adjustments (
              id, product_id, user_id, adjustment_type, quantity_before, quantity_change,
              quantity_after, reason, supplier_id, cost_per_unit, business_id, created_at, sync_status
            ) VALUES (?, ?, ?, 'restock', ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
          `).run(
            newId('adj'),
            req.params.id,
            req.user.id,
            quantityBefore,
            addQty,
            stockAfterUpdate,
            'Stock purchase / restock',
            supplier_id || null,
            unitCost,
            req.user.business_id
          );
        }
      }
    });

    let message = 'Product updated successfully.';
    if (hasSetStock) {
      message = `Product updated. Stock set to ${stockAfterUpdate}.`;
    } else if (addQty > 0) {
      message = `Product updated. Stock increased by ${addQty} to ${stockAfterUpdate}.`;
    }

    res.json({
      message,
      newStock: stockAfterUpdate,
    });
  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return res.status(400).json({ error: 'Barcode or SKU already exists.' });
    }
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

// Delete product (soft delete)
router.delete('/:id', checkPermission('add_edit_products'), async (req, res) => {
  try {
    const existingProduct = await db.prepare(`
      SELECT id FROM products WHERE id = ? AND business_id = ? AND deleted_at IS NULL
    `).get(req.params.id, req.user.business_id);

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await db.prepare(`
      UPDATE products SET deleted_at = datetime('now'), sync_status = 'pending'
      WHERE id = ? AND business_id = ?
    `).run(req.params.id, req.user.business_id);

    res.json({ message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// Adjust stock
router.post('/:id/adjust-stock', checkPermission('adjust_stock'), async (req, res) => {
  try {
    const { adjustment_type, quantity_change, reason, cost_per_unit, supplier_id } = req.body;

    if (!adjustment_type || quantity_change === undefined) {
      return res.status(400).json({ error: 'Adjustment type and quantity change are required.' });
    }

    const product = await db.prepare(`
      SELECT current_stock FROM products WHERE id = ? AND business_id = ? AND deleted_at IS NULL
    `).get(req.params.id, req.user.business_id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const quantityBefore = product.current_stock;
    const quantityAfter = quantityBefore + parseFloat(quantity_change);

    if (quantityAfter < 0) {
      return res.status(400).json({ error: 'Insufficient stock for this adjustment.' });
    }

    await db.transaction(async (tx) => {
      // Update product stock
      await tx.prepare(`
        UPDATE products SET 
          current_stock = ?, 
          updated_at = datetime('now'),
          sync_status = 'pending'
        WHERE id = ? AND business_id = ?
      `).run(quantityAfter, req.params.id, req.user.business_id);

      // Record stock adjustment
      await tx.prepare(`
        INSERT INTO stock_adjustments (
          id, product_id, user_id, adjustment_type, quantity_before, quantity_change,
          quantity_after, reason, supplier_id, cost_per_unit, business_id, created_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
      `).run(
        newId('adj'), req.params.id, req.user.id, adjustment_type, quantityBefore,
        quantity_change, quantityAfter, reason, supplier_id, cost_per_unit,
        req.user.business_id
      );
    });

    res.json({
      message: 'Stock adjusted successfully.',
      newStock: quantityAfter
    });
  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json({ error: 'Failed to adjust stock.' });
  }
});

module.exports = router;
