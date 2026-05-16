const db = require('../db/connection');

const DEFAULT_MTN_URL = 'https://sandbox.momodeveloper.mtn.com';
const DEFAULT_AIRTEL_URL = 'https://openapi.airtel.africa';

function parsePaymentConfig(raw) {
  if (!raw || typeof raw !== 'string') return { mtn: {}, airtel: {} };
  try {
    const o = JSON.parse(raw);
    return {
      mtn: o.mtn && typeof o.mtn === 'object' ? o.mtn : {},
      airtel: o.airtel && typeof o.airtel === 'object' ? o.airtel : {},
    };
  } catch {
    return { mtn: {}, airtel: {} };
  }
}

async function getGlobalMtnUrl() {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'mtn_momo_url'`).get();
  return row?.value || process.env.MTN_MOMO_URL || DEFAULT_MTN_URL;
}

async function getGlobalAirtelUrl() {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'airtel_momo_url'`).get();
  return row?.value || process.env.AIRTEL_MOMO_URL || DEFAULT_AIRTEL_URL;
}

/** MTN Collection API runtime config, or null if not usable for this business */
async function resolveMtnRuntime(paymentConfigJson) {
  const { mtn } = parsePaymentConfig(paymentConfigJson);
  if (!mtn.enabled) return null;
  const url = (mtn.baseUrl && String(mtn.baseUrl).trim()) || (await getGlobalMtnUrl());
  const primaryKey = String(mtn.primaryKey || '').trim();
  const secondaryKey = String(mtn.secondaryKey || '').trim();
  const userId = String(mtn.apiUser || mtn.userId || '').trim();
  const apiSecret = String(mtn.apiSecret || '').trim();
  if (!primaryKey || !apiSecret) return null;
  return {
    url: url.replace(/\/$/, ''),
    primaryKey,
    secondaryKey,
    userId,
    apiSecret,
    targetEnvironment: String(mtn.targetEnvironment || 'sandbox').trim() || 'sandbox',
  };
}

async function resolveAirtelRuntime(paymentConfigJson) {
  const { airtel } = parsePaymentConfig(paymentConfigJson);
  if (!airtel.enabled) return null;
  const url = (airtel.baseUrl && String(airtel.baseUrl).trim()) || (await getGlobalAirtelUrl());
  const clientId = String(airtel.clientId || '').trim();
  const clientSecret = String(airtel.clientSecret || '').trim();
  if (!clientId || !clientSecret) return null;
  return {
    url: url.replace(/\/$/, ''),
    clientId,
    clientSecret,
  };
}

/** Booleans for POS / auth (no secrets) */
async function paymentMethodsAvailability(paymentConfigJson) {
  return {
    cash: true,
    mtn_momo: !!(await resolveMtnRuntime(paymentConfigJson)),
    airtel_money: !!(await resolveAirtelRuntime(paymentConfigJson)),
  };
}

function maskSecret(val) {
  if (!val || typeof val !== 'string') return '';
  const s = val.trim();
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return `••••••••${s.slice(-4)}`;
}

/** Safe payload for developer GET (masked secrets) */
function paymentConfigForDeveloperGet(paymentConfigJson) {
  const { mtn, airtel } = parsePaymentConfig(paymentConfigJson);
  return {
    mtn: {
      enabled: !!mtn.enabled,
      baseUrl: mtn.baseUrl || '',
      targetEnvironment: mtn.targetEnvironment || 'sandbox',
      primaryKey: maskSecret(mtn.primaryKey),
      secondaryKey: maskSecret(mtn.secondaryKey),
      apiUser: mtn.apiUser || mtn.userId || '',
      apiSecret: maskSecret(mtn.apiSecret),
      _primaryKeySet: !!(mtn.primaryKey && String(mtn.primaryKey).trim()),
      _apiSecretSet: !!(mtn.apiSecret && String(mtn.apiSecret).trim()),
    },
    airtel: {
      enabled: !!airtel.enabled,
      baseUrl: airtel.baseUrl || '',
      clientId: airtel.clientId || '',
      clientSecret: maskSecret(airtel.clientSecret),
      _clientSecretSet: !!(airtel.clientSecret && String(airtel.clientSecret).trim()),
    },
  };
}

/**
 * Merge PATCH body into stored JSON. Empty string for a secret field = keep previous.
 */
function mergePaymentConfig(existingRaw, body) {
  const cur = parsePaymentConfig(existingRaw);
  const next = {
    mtn: { ...cur.mtn },
    airtel: { ...cur.airtel },
  };

  if (body.mtn && typeof body.mtn === 'object') {
    const m = body.mtn;
    if (typeof m.enabled === 'boolean') next.mtn.enabled = m.enabled;
    if (m.baseUrl !== undefined) next.mtn.baseUrl = String(m.baseUrl || '').trim();
    if (m.targetEnvironment !== undefined) {
      next.mtn.targetEnvironment = String(m.targetEnvironment || 'sandbox').trim() || 'sandbox';
    }
    if (m.apiUser !== undefined) next.mtn.apiUser = String(m.apiUser || '').trim();
    if (m.userId !== undefined) next.mtn.apiUser = String(m.userId || '').trim();

    const setIfNonEmpty = (key, val) => {
      if (val === undefined || val === null) return;
      const s = String(val).trim();
      if (s === '') return;
      next.mtn[key] = s;
    };
    setIfNonEmpty('primaryKey', m.primaryKey);
    setIfNonEmpty('secondaryKey', m.secondaryKey);
    setIfNonEmpty('apiSecret', m.apiSecret);
  }

  if (body.airtel && typeof body.airtel === 'object') {
    const a = body.airtel;
    if (typeof a.enabled === 'boolean') next.airtel.enabled = a.enabled;
    if (a.baseUrl !== undefined) next.airtel.baseUrl = String(a.baseUrl || '').trim();
    if (a.clientId !== undefined) next.airtel.clientId = String(a.clientId || '').trim();
    if (a.clientSecret !== undefined && String(a.clientSecret).trim() !== '') {
      next.airtel.clientSecret = String(a.clientSecret).trim();
    }
  }

  return JSON.stringify(next);
}

module.exports = {
  parsePaymentConfig,
  resolveMtnRuntime,
  resolveAirtelRuntime,
  paymentMethodsAvailability,
  paymentConfigForDeveloperGet,
  mergePaymentConfig,
  getGlobalMtnUrl,
  getGlobalAirtelUrl,
};
