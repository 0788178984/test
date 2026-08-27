const db = require('../db/connection');
const { newId } = require('../db/ids');
const {
  mergePaymentConfig,
  resolvePesapalRuntime,
} = require('./paymentConfigService');

const SANDBOX_BASE = 'https://cybqa.pesapal.com/pesapalv3/api';
const LIVE_BASE = 'https://pay.pesapal.com/v3/api';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPublicAppUrl() {
  const raw =
    process.env.APP_PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_APP_URL ||
    'http://localhost:4000';
  return String(raw).replace(/\/$/, '');
}

function getBaseUrl(environment) {
  const env = String(environment || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live' ? LIVE_BASE : SANDBOX_BASE;
}

function mapStatusCode(statusCode) {
  const code = Number(statusCode);
  if (code === 1) return 'completed';
  if (code === 2 || code === 3) return 'failed';
  return 'pending';
}

function statusPayloadFromRow(row) {
  if (!row) return null;
  let provider = {};
  try {
    provider = row.provider_response ? JSON.parse(row.provider_response) : {};
  } catch (_) {
    provider = {};
  }
  return {
    success: true,
    status_code: Number(provider.status_code ?? 0),
    payment_status_description: provider.payment_status_description || row.status,
    confirmation_code: provider.confirmation_code || null,
    amount: provider.amount ?? row.amount,
    merchant_reference: provider.merchant_reference || row.reference,
    payment_method: provider.payment_method || 'pesapal',
    pending: row.status === 'pending',
  };
}

async function requestToken(baseUrl, consumerKey, consumerSecret) {
  const res = await fetch(`${baseUrl}/Auth/RequestToken`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.token) {
    throw new Error(data.message || data.error?.message || 'Pesapal authentication failed.');
  }
  return data.token;
}

async function registerIpn(baseUrl, token, url) {
  const res = await fetch(`${baseUrl}/URLSetup/RegisterIPN`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url, ipn_notification_type: 'GET' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ipn_id) {
    throw new Error(data.message || 'Pesapal IPN registration failed.');
  }
  return data.ipn_id;
}

async function submitOrder(baseUrl, token, payload) {
  const res = await fetch(`${baseUrl}/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.redirect_url || !data.order_tracking_id) {
    throw new Error(data.message || data.error?.message || 'Pesapal order submission failed.');
  }
  return data;
}

async function getTransactionStatus(baseUrl, token, orderTrackingId) {
  const q = encodeURIComponent(orderTrackingId);
  const res = await fetch(`${baseUrl}/Transactions/GetTransactionStatus?orderTrackingId=${q}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!data || data.status !== '200') {
    throw new Error(data.message || 'Failed to fetch Pesapal transaction status.');
  }
  return data;
}

async function saveNotificationId(businessId, notificationId) {
  const row = await db.prepare(`SELECT payment_config FROM businesses WHERE id = ?`).get(businessId);
  const merged = mergePaymentConfig(row?.payment_config, {
    pesapal: { notificationId },
  });
  await db
    .prepare(`UPDATE businesses SET payment_config = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(merged, businessId);
}

async function ensureNotificationId(businessId, runtime) {
  if (runtime.notificationId) return runtime.notificationId;

  const token = await requestToken(runtime.baseUrl, runtime.consumerKey, runtime.consumerSecret);
  const ipnUrl = `${getPublicAppUrl()}/api/payments/pesapal/ipn/${encodeURIComponent(businessId)}`;
  const ipnId = await registerIpn(runtime.baseUrl, token, ipnUrl);
  await saveNotificationId(businessId, ipnId);
  runtime.notificationId = ipnId;
  return ipnId;
}

function sanitizeMerchantReference(businessCode, suffix) {
  const code = String(businessCode || 'STORE')
    .replace(/[^a-zA-Z0-9._:-]/g, '')
    .slice(0, 12);
  const ref = `POS-${code}-${suffix}`.replace(/[^a-zA-Z0-9._:-]/g, '-');
  return ref.slice(0, 50);
}

async function recordPendingPayment(businessId, orderTrackingId, opts) {
  const existing = await db
    .prepare(`SELECT id FROM mobile_money_transactions WHERE external_id = ? AND business_id = ?`)
    .get(orderTrackingId, businessId);
  if (existing?.id) return;

  await db
    .prepare(
      `
      INSERT INTO mobile_money_transactions (
        id, external_id, business_id, reference, method, phone, amount, status,
        provider_response, created_at, sync_status
      ) VALUES (?, ?, ?, ?, 'pesapal', ?, ?, 'pending', ?, datetime('now'), 'pending')
    `
    )
    .run(
      newId('mmtx'),
      orderTrackingId,
      businessId,
      opts.merchantReference || orderTrackingId,
      opts.phone || null,
      opts.amount,
      JSON.stringify({ status_code: 0, order_tracking_id: orderTrackingId })
    );
}

async function persistPaymentStatus(businessId, orderTrackingId, statusPayload) {
  const status = mapStatusCode(statusPayload.status_code);
  await db
    .prepare(
      `
      UPDATE mobile_money_transactions SET
        status = ?,
        provider_response = ?,
        updated_at = datetime('now'),
        sync_status = 'pending'
      WHERE external_id = ? AND business_id = ?
    `
    )
    .run(status, JSON.stringify(statusPayload), orderTrackingId, businessId);
}

async function getStoredPaymentStatus(businessId, orderTrackingId) {
  const row = await db
    .prepare(
      `SELECT * FROM mobile_money_transactions WHERE external_id = ? AND business_id = ?`
    )
    .get(orderTrackingId, businessId);
  return statusPayloadFromRow(row);
}

class PesapalService {
  async initiatePaymentForBusiness(businessId, businessCode, businessName, opts) {
    const row = await db.prepare(`SELECT payment_config FROM businesses WHERE id = ?`).get(businessId);
    const runtime = await resolvePesapalRuntime(row?.payment_config);
    if (!runtime) {
      return { success: false, error: 'Pesapal is not configured for this store. Ask your developer to enable it.' };
    }

    const amount = Number(opts.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      return { success: false, error: 'Invalid amount.' };
    }

    const phone = String(opts.phone || '').trim();
    const email = String(opts.email || '').trim();
    if (!phone && !email) {
      return { success: false, error: 'Customer phone or email is required for Pesapal.' };
    }

    try {
      const notificationId = await ensureNotificationId(businessId, runtime);
      const token = await requestToken(runtime.baseUrl, runtime.consumerKey, runtime.consumerSecret);
      const merchantReference = sanitizeMerchantReference(
        businessCode,
        String(opts.reference || Date.now())
      );
      const publicUrl = getPublicAppUrl();

      const orderPayload = {
        id: merchantReference,
        currency: runtime.currency,
        amount,
        description: String(opts.description || `POS sale — ${businessName || businessCode}`).slice(0, 100),
        callback_url: `${publicUrl}/api/payments/pesapal/callback`,
        notification_id: notificationId,
        branch: String(businessName || businessCode || '').slice(0, 50),
        billing_address: {
          phone_number: phone || undefined,
          email_address: email || undefined,
          country_code: 'UG',
          first_name: String(opts.firstName || 'Customer').slice(0, 50),
          last_name: String(opts.lastName || '').slice(0, 50),
        },
      };

      const submitted = await submitOrder(runtime.baseUrl, token, orderPayload);

      await recordPendingPayment(businessId, submitted.order_tracking_id, {
        merchantReference: submitted.merchant_reference || merchantReference,
        phone,
        amount,
      });

      return {
        success: true,
        redirect_url: submitted.redirect_url,
        order_tracking_id: submitted.order_tracking_id,
        merchant_reference: submitted.merchant_reference || merchantReference,
      };
    } catch (err) {
      console.error('Pesapal initiate error:', err);
      return { success: false, error: err.message || 'Pesapal payment initiation failed.' };
    }
  }

  async getPaymentStatusForBusiness(businessId, orderTrackingId) {
    const row = await db.prepare(`SELECT payment_config FROM businesses WHERE id = ?`).get(businessId);
    const runtime = await resolvePesapalRuntime(row?.payment_config);
    if (!runtime) {
      return { success: false, error: 'Pesapal is not configured for this store.' };
    }

    const cached = await getStoredPaymentStatus(businessId, orderTrackingId);
    if (cached && !cached.pending && cached.status_code !== 0) {
      return cached;
    }

    try {
      const token = await requestToken(runtime.baseUrl, runtime.consumerKey, runtime.consumerSecret);
      const status = await getTransactionStatus(runtime.baseUrl, token, orderTrackingId);
      const payload = {
        success: true,
        status_code: Number(status.status_code),
        payment_status_description: status.payment_status_description,
        confirmation_code: status.confirmation_code,
        amount: status.amount,
        merchant_reference: status.merchant_reference,
        payment_method: status.payment_method,
        pending: mapStatusCode(status.status_code) === 'pending',
      };
      await persistPaymentStatus(businessId, orderTrackingId, payload);
      return payload;
    } catch (err) {
      console.error('Pesapal status error:', err);
      if (cached) return cached;
      return { success: false, error: err.message || 'Failed to check Pesapal payment status.' };
    }
  }

  /** Wait for IPN/webhook or cached status — one server-side poll loop instead of many client polls. */
  async waitForPaymentStatus(businessId, orderTrackingId, maxWaitMs = 45000) {
    const deadline = Date.now() + Math.min(Math.max(maxWaitMs, 5000), 90000);
    let lastApiCheck = 0;

    while (Date.now() < deadline) {
      const cached = await getStoredPaymentStatus(businessId, orderTrackingId);
      if (cached && !cached.pending && cached.status_code !== 0) {
        return cached;
      }

      if (Date.now() - lastApiCheck >= 10000) {
        lastApiCheck = Date.now();
        const live = await this.getPaymentStatusForBusiness(businessId, orderTrackingId);
        if (live.success && !live.pending && live.status_code !== 0) {
          return live;
        }
      }

      await sleep(2000);
    }

    const final = await getStoredPaymentStatus(businessId, orderTrackingId);
    if (final) return final;
    return { success: true, status_code: 0, pending: true, payment_status_description: 'Awaiting payment' };
  }
}

module.exports = new PesapalService();
module.exports.getPublicAppUrl = getPublicAppUrl;
