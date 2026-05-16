const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { paymentMethodsAvailability } = require('../services/paymentConfigService');
const mobileMoneyService = require('../services/mobilemoneyService');

const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

/** Which MoMo options this store can use (from developer-configured credentials). Cash is always on. */
router.get('/methods', async (req, res) => {
  try {
    const row = await db.prepare(`SELECT payment_config FROM businesses WHERE id = ?`).get(req.user.business_id);
    res.json({ methods: await paymentMethodsAvailability(row?.payment_config) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load payment methods.' });
  }
});

/**
 * Request MTN/Airtel collection before completing a sale (per-store API keys).
 * Returns provider reference to store on the sale as payment_reference.
 */
router.post('/request-collection', checkPermission('make_sale'), async (req, res) => {
  try {
    const { method, phone, amount, reference } = req.body;
    if (!method || !phone || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'method, phone, and amount are required.' });
    }
    const n = Number(amount);
    if (Number.isNaN(n) || n <= 0) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }
    const ref =
      reference && String(reference).trim() ? String(reference).trim() : `POS-${Date.now()}`;

    const result = await mobileMoneyService.requestPaymentForBusiness(
      req.user.business_id,
      method,
      phone,
      n,
      ref
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Payment request failed.' });
    }

    res.json({
      success: true,
      transactionId: result.transactionId,
      status: result.status,
      payment_reference: result.transactionId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Payment request failed.' });
  }
});

module.exports = router;
