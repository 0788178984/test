const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { paymentMethodsAvailability } = require('../services/paymentConfigService');
const mobileMoneyService = require('../services/mobilemoneyService');
const pesapalService = require('../services/pesapalService');

const router = express.Router();

/** Pesapal redirect after customer pays — no auth required. */
router.get('/pesapal/callback', (req, res) => {
  const trackingId = req.query.OrderTrackingId || req.query.orderTrackingId || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment received</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:1.5rem;text-align:center}
h1{color:#15803d;font-size:1.25rem}p{color:#374151;line-height:1.5}</style></head>
<body>
<h1>Payment processed</h1>
<p>Return to the POS screen — the cashier will confirm your payment automatically.</p>
<p style="font-size:0.85rem;color:#6b7280">Ref: ${String(trackingId).slice(0, 36)}</p>
</body></html>`);
});

/** Pesapal IPN — must respond with status 200 JSON. */
router.get('/pesapal/ipn/:businessId', async (req, res) => {
  try {
    const orderTrackingId = req.query.OrderTrackingId || req.query.orderTrackingId;
    const merchantRef = req.query.OrderMerchantReference || req.query.orderMerchantReference || '';
    if (orderTrackingId && req.params.businessId) {
      await pesapalService.getPaymentStatusForBusiness(req.params.businessId, String(orderTrackingId));
    }
    res.json({
      orderNotificationType: req.query.OrderNotificationType || 'IPNCHANGE',
      orderTrackingId: orderTrackingId || null,
      orderMerchantReference: merchantRef,
      status: 200,
    });
  } catch (e) {
    console.error('Pesapal IPN error:', e);
    res.status(500).json({ status: 500, message: 'IPN processing failed.' });
  }
});

router.use(authenticate, restrictToBusinessStaff);

/** Which payment options this store can use (per developer-configured credentials). Cash is always on. */
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

/** Start Pesapal checkout — returns redirect URL for customer. */
router.post('/pesapal/initiate', checkPermission('make_sale'), async (req, res) => {
  try {
    const { amount, phone, email, reference, description, firstName, lastName } = req.body;
    const n = Number(amount);
    if (Number.isNaN(n) || n <= 0) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    const result = await pesapalService.initiatePaymentForBusiness(
      req.user.business_id,
      req.user.business_code,
      req.user.business_name,
      {
        amount: n,
        phone,
        email,
        reference,
        description,
        firstName,
        lastName,
      }
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Pesapal initiation failed.' });
    }

    res.json({
      success: true,
      redirect_url: result.redirect_url,
      order_tracking_id: result.order_tracking_id,
      merchant_reference: result.merchant_reference,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pesapal initiation failed.' });
  }
});

/** Poll Pesapal payment status after customer pays. */
router.get('/pesapal/status', checkPermission('make_sale'), async (req, res) => {
  try {
    const orderTrackingId = req.query.order_tracking_id || req.query.tracking_id;
    if (!orderTrackingId) {
      return res.status(400).json({ error: 'order_tracking_id is required.' });
    }

    const result = await pesapalService.getPaymentStatusForBusiness(
      req.user.business_id,
      String(orderTrackingId)
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Status check failed.' });
    }

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pesapal status check failed.' });
  }
});

/** Wait for Pesapal IPN/callback to confirm payment (single long request, replaces rapid client polling). */
router.get('/pesapal/wait', checkPermission('make_sale'), async (req, res) => {
  try {
    const orderTrackingId = req.query.order_tracking_id || req.query.tracking_id;
    if (!orderTrackingId) {
      return res.status(400).json({ error: 'order_tracking_id is required.' });
    }

    const timeoutMs = Math.min(Number(req.query.timeout_ms) || 45000, 90000);
    const result = await pesapalService.waitForPaymentStatus(
      req.user.business_id,
      String(orderTrackingId),
      timeoutMs
    );

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Pesapal wait failed.' });
  }
});

module.exports = router;
