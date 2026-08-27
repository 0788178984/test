const db = require('../db/connection');

const DEFAULT_MTN_URL = 'https://sandbox.momodeveloper.mtn.com';
const DEFAULT_AIRTEL_URL = 'https://openapi.airtel.africa';
const PESAPAL_SANDBOX_BASE = 'https://cybqa.pesapal.com/pesapalv3/api';
const PESAPAL_LIVE_BASE = 'https://pay.pesapal.com/v3/api';

function parsePaymentConfig(raw) {
  if (!raw || typeof raw !== 'string') return { mtn: {}, airtel: {}, pesapal: {} };
  try {
    const o = JSON.parse(raw);
    return {
      mtn: o.mtn && typeof o.mtn === 'object' ? o.mtn : {},
      airtel: o.airtel && typeof o.airtel === 'object' ? o.airtel : {},
      pesapal: o.pesapal && typeof o.pesapal === 'object' ? o.pesapal : {},
    };
  } catch {
    return { mtn: {}, airtel: {}, pesapal: {} };
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

function pesapalBaseUrl(environment) {
  const env = String(environment || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live' ? PESAPAL_LIVE_BASE : PESAPAL_SANDBOX_BASE;
}

/** Per-store Pesapal runtime config, or null if not enabled / incomplete. */
async function resolvePesapalRuntime(paymentConfigJson) {
  const { pesapal } = parsePaymentConfig(paymentConfigJson);
  if (!pesapal.enabled) return null;

  const consumerKey = String(pesapal.consumerKey || '').trim();
  const consumerSecret = String(pesapal.consumerSecret || '').trim();
  if (!consumerKey || !consumerSecret) return null;

  const environment = String(pesapal.environment || 'production').trim() || 'production';
  const currency = String(pesapal.currency || 'UGX').trim() || 'UGX';

  return {
    consumerKey,
    consumerSecret,
    environment,
    currency,
    notificationId: String(pesapal.notificationId || '').trim() || null,
    baseUrl: pesapalBaseUrl(environment),
  };
}

/** Booleans for POS / auth (no secrets) */
async function paymentMethodsAvailability(paymentConfigJson) {
  return {
    cash: true,
    mtn_momo: !!(await resolveMtnRuntime(paymentConfigJson)),
    airtel_money: !!(await resolveAirtelRuntime(paymentConfigJson)),
    pesapal: !!(await resolvePesapalRuntime(paymentConfigJson)),
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
  const { mtn, airtel, pesapal } = parsePaymentConfig(paymentConfigJson);
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
    pesapal: {
      enabled: !!pesapal.enabled,
      environment: pesapal.environment || 'production',
      currency: pesapal.currency || 'UGX',
      consumerKey: maskSecret(pesapal.consumerKey),
      consumerSecret: maskSecret(pesapal.consumerSecret),
      notificationId: pesapal.notificationId || '',
      _consumerKeySet: !!(pesapal.consumerKey && String(pesapal.consumerKey).trim()),
      _consumerSecretSet: !!(pesapal.consumerSecret && String(pesapal.consumerSecret).trim()),
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
    pesapal: { ...cur.pesapal },
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

  if (body.pesapal && typeof body.pesapal === 'object') {
    const p = body.pesapal;
    if (typeof p.enabled === 'boolean') next.pesapal.enabled = p.enabled;
    if (p.environment !== undefined) {
      next.pesapal.environment = String(p.environment || 'production').trim() || 'production';
    }
    if (p.currency !== undefined) next.pesapal.currency = String(p.currency || 'UGX').trim() || 'UGX';
    if (p.notificationId !== undefined) next.pesapal.notificationId = String(p.notificationId || '').trim();
    const setPesapalIfNonEmpty = (key, val) => {
      if (val === undefined || val === null) return;
      const s = String(val).trim();
      if (s === '') return;
      next.pesapal[key] = s;
    };
    setPesapalIfNonEmpty('consumerKey', p.consumerKey);
    setPesapalIfNonEmpty('consumerSecret', p.consumerSecret);
  }

  return JSON.stringify(next);
}

module.exports = {
  parsePaymentConfig,
  resolveMtnRuntime,
  resolveAirtelRuntime,
  resolvePesapalRuntime,
  paymentMethodsAvailability,
  paymentConfigForDeveloperGet,
  mergePaymentConfig,
  getGlobalMtnUrl,
  getGlobalAirtelUrl,
  pesapalBaseUrl,
};
