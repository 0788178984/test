const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const bid = (req) => req.user.business_id;

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const suppliers = db
      .prepare(
        `
      SELECT * FROM suppliers
      WHERE deleted_at IS NULL AND business_id = ?
      ORDER BY name
      LIMIT ? OFFSET ?
    `
      )
      .all(bid(req), parseInt(limit, 10), offset);

    const { total } = db
      .prepare(`SELECT COUNT(*) as total FROM suppliers WHERE deleted_at IS NULL AND business_id = ?`)
      .get(bid(req));

    res.json({
      suppliers,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const supplier = db
      .prepare(`SELECT * FROM suppliers WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    const products = db
      .prepare(
        `
      SELECT id, name, sku, current_stock, buying_price, selling_price
      FROM products
      WHERE supplier_id = ? AND deleted_at IS NULL AND business_id = ?
      ORDER BY name
    `
      )
      .all(req.params.id, bid(req));

    res.json({ supplier, products });
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json({ error: 'Failed to fetch supplier.' });
  }
});

router.post('/', checkPermission('manage_suppliers'), async (req, res) => {
  try {
    const { name, contact_name, phone, email, address, tin_number, payment_terms, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required.' });
    }

    await db.prepare(
      `
      INSERT INTO suppliers (
        name, contact_name, phone, email, address, tin_number,
        payment_terms, notes, business_id, created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending')
    `
    ).run(name, contact_name, phone, email, address, tin_number, payment_terms, notes, bid(req));

    res.status(201).json({
      message: 'Supplier created successfully.',
    });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ error: 'Failed to create supplier.' });
  }
});

router.put('/:id', checkPermission('manage_suppliers'), async (req, res) => {
  try {
    const { name, contact_name, phone, email, address, tin_number, payment_terms, notes } = req.body;

    const existingSupplier = db
      .prepare(`SELECT id FROM suppliers WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    await db.prepare(
      `
      UPDATE suppliers SET
        name = ?, contact_name = ?, phone = ?, email = ?, address = ?,
        tin_number = ?, payment_terms = ?, notes = ?,
        updated_at = datetime('now'), sync_status = 'pending'
      WHERE id = ? AND business_id = ?
    `
    ).run(
      name,
      contact_name,
      phone,
      email,
      address,
      tin_number,
      payment_terms,
      notes,
      req.params.id,
      bid(req)
    );

    res.json({ message: 'Supplier updated successfully.' });
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ error: 'Failed to update supplier.' });
  }
});

router.delete('/:id', checkPermission('manage_suppliers'), async (req, res) => {
  try {
    const existingSupplier = db
      .prepare(`SELECT id FROM suppliers WHERE id = ? AND deleted_at IS NULL AND business_id = ?`)
      .get(req.params.id, bid(req));

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    const productCount = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM products
      WHERE supplier_id = ? AND deleted_at IS NULL AND business_id = ?
    `
      )
      .get(req.params.id, bid(req)).count;

    if (productCount > 0) {
      return res.status(400).json({
        error:
          'Cannot delete supplier with associated products. Please reassign or delete the products first.',
      });
    }

    await db.prepare(
      `UPDATE suppliers SET deleted_at = datetime('now'), sync_status = 'pending' WHERE id = ? AND business_id = ?`
    ).run(req.params.id, bid(req));

    res.json({ message: 'Supplier deleted successfully.' });
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({ error: 'Failed to delete supplier.' });
  }
});

module.exports = router;
