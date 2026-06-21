const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const { dispatch } = require('./notifications');
const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

const NOTIFY_ACTIONS = new Set([
  'line_removed',
  'cart_cleared',
  'discount_applied',
  'wholesale_markup_changed',
  'quantity_reduced',
]);

router.post('/', checkPermission('make_sale'), async (req, res) => {
  try {
    const {
      action,
      product_name,
      quantity,
      line_amount,
      cart_total,
      meta = {},
    } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required.' });
    }

    const logId = newId('cart');

    await db.prepare(`
      INSERT INTO cart_audit_log (
        id, user_id, action, product_name, quantity, line_amount, cart_total,
        meta, business_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      logId,
      req.user.id,
      action,
      product_name || null,
      quantity ?? null,
      line_amount ?? null,
      cart_total ?? null,
      JSON.stringify(meta),
      req.user.business_id
    );

    if (NOTIFY_ACTIONS.has(action)) {
      const eventMap = {
        line_removed: 'CART_LINE_REMOVED',
        cart_cleared: 'CART_CLEARED',
        discount_applied: 'DISCOUNT_APPROVAL',
        wholesale_markup_changed: 'CART_WHOLESALE_CHANGED',
        quantity_reduced: 'CART_LINE_REMOVED',
      };

      const eventType = eventMap[action];
      if (eventType) {
        dispatch(
          eventType,
          {
            cashier_name: req.user.name,
            product_name: product_name || 'Unknown',
            quantity,
            line_amount,
            cart_total,
            discount: meta.discount_percent || meta.discount_amount,
            sale_number: meta.sale_number,
            reason: meta.reason,
            ...meta,
          },
          { business_id: req.user.business_id, sender_user_id: req.user.id }
        );
      }
    }

    res.status(201).json({ message: 'Cart action logged.', id: logId });
  } catch (error) {
    console.error('Cart audit error:', error);
    res.status(500).json({ error: 'Failed to log cart action.' });
  }
});

module.exports = router;
