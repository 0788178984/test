const { getStoreToday, STORE_TZ } = require('./storeTime');

/** Calendar date (YYYY-MM-DD) of an expiry timestamp in the store timezone. */
function expiryDateInStoreTz(expiresAt) {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * True when a store should be blocked for subscription/licence reasons.
 * Expiry is inclusive through the end of the expiry calendar day (store TZ).
 */
function isSubscriptionExpired(subscription_status, subscription_expires_at) {
  const sub = (subscription_status || 'trial').toLowerCase();
  if (sub === 'suspended' || sub === 'expired') return true;
  const expiryDay = expiryDateInStoreTz(subscription_expires_at);
  if (!expiryDay) return false;
  return getStoreToday() > expiryDay;
}

function parseSubscriptionExpiresAt(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : `${s}T23:59:59`);
  if (Number.isNaN(d.getTime())) return { error: 'Expires at must be a valid date (e.g. 2026-12-31).' };
  return d.toISOString();
}

function formatExpiryForInput(expiresAt) {
  return expiryDateInStoreTz(expiresAt) || '';
}

module.exports = {
  isSubscriptionExpired,
  parseSubscriptionExpiresAt,
  formatExpiryForInput,
  expiryDateInStoreTz,
  STORE_TZ,
};
