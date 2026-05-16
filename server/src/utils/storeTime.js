/**
 * Store calendar day boundaries (default: Uganda / East Africa Time).
 * Sales and reports use this so "today" resets at local midnight, not UTC.
 */
const STORE_TZ = process.env.STORE_TIMEZONE || 'Africa/Kampala';

/** YYYY-MM-DD in store timezone */
function getStoreToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** SQL expression: local calendar date of a timestamptz column */
function saleLocalDate(column = 's.created_at') {
  return `(${column} AT TIME ZONE '${STORE_TZ}')::date`;
}

module.exports = { STORE_TZ, getStoreToday, saleLocalDate };
