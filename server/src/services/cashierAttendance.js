const db = require('../db/connection');
const { newId } = require('../db/ids');
const { STORE_TZ, getStoreToday } = require('../utils/storeTime');
const { dispatchToSupervisors } = require('../routes/notifications');

function isMissingTable(error) {
  return error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message || ''));
}

function formatReportTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-UG', {
    timeZone: STORE_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Record a cashier's first sign-in for the store's calendar day.
 * Later logins the same day do not change the time. Leaving is not stored.
 * Failures are swallowed so a missing table cannot block login.
 */
async function recordCashierReport(user) {
  if (!user || user.role !== 'cashier' || !user.id || !user.business_id) return null;

  const workDate = getStoreToday();

  try {
    const inserted = await db
      .prepare(
        `
        INSERT INTO cashier_attendance (id, business_id, user_id, work_date, reported_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT (business_id, user_id, work_date) DO NOTHING
        RETURNING reported_at
      `
      )
      .run(newId('att'), user.business_id, user.id, workDate);

    const reportedAt = inserted.rows?.[0]?.reported_at;
    if (!reportedAt) return null;

    const reportedAtLabel = formatReportTime(reportedAt);
    try {
      await Promise.all(
        dispatchToSupervisors(
          'CASHIER_REPORTED',
          {
            cashier_name: user.name || 'Cashier',
            reported_at_label: reportedAtLabel,
            work_date: workDate,
          },
          { business_id: user.business_id, sender_user_id: user.id }
        )
      );
    } catch (error) {
      console.warn('[attendance] notify skipped:', error.message);
    }

    return {
      welcome: true,
      work_date: workDate,
      reported_at: reportedAt,
      reported_at_label: reportedAtLabel,
    };
  } catch (error) {
    if (!isMissingTable(error)) {
      console.warn('[attendance] record skipped, login continues:', error.message);
    }
    return null;
  }
}

module.exports = { recordCashierReport, formatReportTime };
