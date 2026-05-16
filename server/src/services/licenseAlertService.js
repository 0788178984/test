const db = require('../db/connection');

async function getDeveloperUserId() {
  const row = await db
    .prepare(`SELECT id FROM users WHERE role = 'developer' AND deleted_at IS NULL LIMIT 1`)
    .get();
  return row?.id || null;
}

/**
 * Classify businesses for dashboards and scheduled reminders.
 * @returns {{ out_of_licence: object[], expiring_soon: object[], expiring_this_month: object[] }}
 */
async function classifyLicenseStates() {
  const businesses = await db.prepare(`SELECT * FROM businesses ORDER BY name`).all();
  const now = new Date();
  const out_of_licence = [];
  const expiring_soon = [];
  const expiring_this_month = [];

  for (const b of businesses) {
    const sub = (b.subscription_status || 'trial').toLowerCase();
    const exp = b.subscription_expires_at ? new Date(b.subscription_expires_at) : null;
    const expValid = exp && !Number.isNaN(exp.getTime());
    const past = expValid && exp < now;
    const blocked =
      sub === 'suspended' || sub === 'expired' || past;

    let days_until_expiry = null;
    if (expValid && !past) {
      days_until_expiry = Math.ceil((exp - now) / 86400000);
    } else if (expValid && past) {
      days_until_expiry = Math.ceil((exp - now) / 86400000);
    }

    const row = {
      ...b,
      days_until_expiry,
      is_past_expiry: !!past,
      is_blocked: blocked,
    };

    if (blocked) {
      out_of_licence.push(row);
    } else if (expValid && days_until_expiry !== null && days_until_expiry >= 0 && days_until_expiry <= 14) {
      expiring_soon.push(row);
    } else if (
      expValid &&
      days_until_expiry !== null &&
      days_until_expiry > 14 &&
      days_until_expiry <= 30
    ) {
      expiring_this_month.push(row);
    }
  }

  return { out_of_licence, expiring_soon, expiring_this_month };
}

/**
 * Daily job: in-app digest for developer; reminders for store admins/managers.
 * @param {function} createNotification from routes/notifications
 */
async function runDailyLicenseReminders(createNotification) {
  const { out_of_licence, expiring_soon, expiring_this_month } = await classifyLicenseStates();
  const devId = await getDeveloperUserId();

  if (devId && (out_of_licence.length || expiring_soon.length || expiring_this_month.length)) {
    const recentDigest = await db
      .prepare(
        `
      SELECT id FROM notifications
      WHERE type = 'developer_license_digest'
        AND target_user_id = ?
        AND datetime(created_at) > datetime('now', '-20 hours')
    `
      )
      .get(devId);

    if (!recentDigest) {
      const lines = [];
      out_of_licence.forEach((b) => {
        lines.push(`• ${b.name} (${b.business_code}): OUT OF LICENCE — status ${b.subscription_status}`);
      });
      expiring_soon.forEach((b) => {
        lines.push(
          `• ${b.name} (${b.business_code}): expires in ${b.days_until_expiry}d (${b.subscription_expires_at})`
        );
      });
      expiring_this_month.forEach((b) => {
        lines.push(
          `• ${b.name} (${b.business_code}): expires in ${b.days_until_expiry}d (${b.subscription_expires_at})`
        );
      });

      createNotification({
        type: 'developer_license_digest',
        title: 'Licence overview',
        message:
          lines.join('\n').slice(0, 4000) ||
          'No subscription issues.',
        severity: out_of_licence.length ? 'danger' : 'warning',
        target_user_id: devId,
        business_id: null,
        channels: ['in_app'],
        meta: {
          out_count: out_of_licence.length,
          soon_count: expiring_soon.length,
          month_count: expiring_this_month.length,
        },
      });
    }
  }

  for (const b of out_of_licence) {
    const recent = await db
      .prepare(
        `
      SELECT id FROM notifications
      WHERE type = 'licence_inactive'
        AND business_id = ?
        AND datetime(created_at) > datetime('now', '-3 days')
    `
      )
      .get(b.id);
    if (recent) continue;

    for (const role of ['admin', 'manager']) {
      createNotification({
        type: 'licence_inactive',
        title: 'Store licence inactive',
        message: `Your store "${b.name}" is not licensed or access is suspended (${b.subscription_status}). Contact your system provider to renew.`,
        severity: 'danger',
        target_role: role,
        business_id: b.id,
        channels: ['in_app'],
        meta: { business_id: b.id, business_code: b.business_code },
      });
    }
  }

  for (const b of expiring_soon) {
    const days = b.days_until_expiry;
    if (days == null || days < 0) continue;
    const bucket = days <= 7 ? '7d' : '14d';
    const recent = await db
      .prepare(
        `
      SELECT id FROM notifications
      WHERE type = 'licence_expiry_warning'
        AND business_id = ?
        AND json_extract(meta, '$.bucket') = ?
        AND datetime(created_at) > datetime('now', '-6 days')
    `
      )
      .get(b.id, bucket);
    if (recent) continue;

    for (const role of ['admin', 'manager']) {
      createNotification({
        type: 'licence_expiry_warning',
        title: 'Licence / subscription ending soon',
        message: `${b.name}: your term ends on ${b.subscription_expires_at} (${days} day(s) left). Contact your system provider to renew.`,
        severity: days <= 7 ? 'warning' : 'info',
        target_role: role,
        business_id: b.id,
        channels: ['in_app'],
        meta: { bucket, business_id: b.id, days_remaining: days },
      });
    }
  }
}

module.exports = {
  classifyLicenseStates,
  runDailyLicenseReminders,
  getDeveloperUserId,
};
