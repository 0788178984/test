const db = require('../db/connection');
const { newId } = require('../db/ids');
const { roundUgx } = require('../utils/money');

const DEFAULT_TITLE = 'End of year gift draw';
const DEFAULT_REASON =
  'Christmas and end of year gifts for customers who spend the qualifying amount.';
const DEFAULT_MIN = 5000;

function isMissingTable(error) {
  return error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message || ''));
}

function normalizeToken(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40);
}

function normalizeName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function parseGifts(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : item?.name))
      .map((name) => String(name || '').trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 40);
  }
  if (!value) return [];
  try {
    return parseGifts(JSON.parse(value));
  } catch {
    return [];
  }
}

function presentCampaign(row) {
  if (!row) {
    return {
      id: null,
      enabled: false,
      title: DEFAULT_TITLE,
      reason: DEFAULT_REASON,
      min_amount: DEFAULT_MIN,
      gifts: [],
    };
  }
  return {
    id: row.id,
    enabled: Number(row.enabled) === 1,
    title: row.title || DEFAULT_TITLE,
    reason: row.reason || '',
    min_amount: roundUgx(row.min_amount || DEFAULT_MIN),
    gifts: parseGifts(row.gifts),
  };
}

async function getCampaign(businessId) {
  if (!businessId) return null;
  try {
    return await db
      .prepare(
        `
      SELECT id, business_id, enabled, title, reason, min_amount, gifts
      FROM draw_campaigns
      WHERE business_id = ?
    `
      )
      .get(businessId);
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

function qualifies(campaign, totalAmount) {
  if (!campaign || Number(campaign.enabled) !== 1) return false;
  const min = roundUgx(campaign.min_amount || DEFAULT_MIN);
  return roundUgx(totalAmount) + 0.001 >= min;
}

function captureFromBody(body) {
  const name = normalizeName(body?.draw_customer_name);
  const token = normalizeToken(body?.draw_customer_token);
  if (name.length < 2) {
    return { error: 'Enter the customer name for the gift draw (at least 2 characters).' };
  }
  if (token.length < 2) {
    return { error: 'Enter the customer ID or token for the gift draw (letters or numbers).' };
  }
  return { name, token };
}

async function insertEntry(tx, { businessId, campaignId, saleId, name, token, amount, userId }) {
  await tx
    .prepare(
      `
      INSERT INTO draw_entries (
        id, business_id, campaign_id, sale_id, customer_name, customer_token,
        amount, recorded_by, voided, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `
    )
    .run(newId('draw'), businessId, campaignId, saleId, name, token, roundUgx(amount), userId);
}

/** Keep the surrounding sale transaction alive if the new draw tables fail. */
async function runSavepoint(tx, name, fn) {
  await tx.prepare(`SAVEPOINT ${name}`).run();
  try {
    await fn();
    await tx.prepare(`RELEASE SAVEPOINT ${name}`).run();
    return true;
  } catch (error) {
    try {
      await tx.prepare(`ROLLBACK TO SAVEPOINT ${name}`).run();
    } catch (rollbackError) {
      console.warn(`[draw] ${name} rollback failed:`, rollbackError.message);
      throw error;
    }
    console.warn(`[draw] ${name} skipped:`, error.message);
    return false;
  }
}

async function voidEntry(tx, saleId, businessId) {
  await runSavepoint(tx, 'draw_void', async () => {
    const rel = await tx.prepare(`SELECT to_regclass('public.draw_entries') AS rel`).get();
    if (!rel || !rel.rel) return;
    await tx
      .prepare(
        `
        UPDATE draw_entries
        SET voided = 1
        WHERE sale_id = ? AND business_id = ? AND voided = 0
      `
      )
      .run(saleId, businessId);
  });
}

async function tokenSummary(businessId, campaignId, token) {
  const row = await db
    .prepare(
      `
      SELECT
        COUNT(*)::int AS visits,
        COALESCE(SUM(amount), 0) AS total_amount,
        (ARRAY_AGG(customer_name ORDER BY created_at DESC))[1] AS customer_name
      FROM draw_entries
      WHERE business_id = ? AND campaign_id = ? AND customer_token = ? AND voided = 0
    `
    )
    .get(businessId, campaignId, token);
  const visits = Number(row?.visits) || 0;
  return {
    found: visits > 0,
    visits,
    total_amount: roundUgx(row?.total_amount || 0),
    customer_name: row?.customer_name || null,
  };
}

async function leaderboard(businessId, campaignId) {
  const rows = await db
    .prepare(
      `
      SELECT
        customer_token,
        (ARRAY_AGG(customer_name ORDER BY created_at DESC))[1] AS customer_name,
        COUNT(*)::int AS visits,
        COALESCE(SUM(amount), 0) AS total_amount,
        MAX(created_at) AS last_visit
      FROM draw_entries
      WHERE business_id = ? AND campaign_id = ? AND voided = 0
      GROUP BY customer_token
      ORDER BY total_amount DESC, visits DESC, customer_name ASC
    `
    )
    .all(businessId, campaignId);

  const pool = rows.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0);
  const visitPool = rows.reduce((sum, row) => sum + (Number(row.visits) || 0), 0);

  const participants = rows.map((row, index) => {
    const total = roundUgx(row.total_amount || 0);
    const visits = Number(row.visits) || 0;
    return {
      rank: index + 1,
      customer_token: row.customer_token,
      customer_name: row.customer_name,
      visits,
      total_amount: total,
      amount_percent: pool > 0 ? Math.round((total / pool) * 1000) / 10 : 0,
      visit_percent: visitPool > 0 ? Math.round((visits / visitPool) * 1000) / 10 : 0,
      last_visit: row.last_visit,
    };
  });

  return {
    participant_count: participants.length,
    visit_count: visitPool,
    pool_amount: roundUgx(pool),
    participants,
  };
}

module.exports = {
  DEFAULT_MIN,
  DEFAULT_REASON,
  DEFAULT_TITLE,
  presentCampaign,
  parseGifts,
  getCampaign,
  qualifies,
  captureFromBody,
  insertEntry,
  runSavepoint,
  voidEntry,
  tokenSummary,
  leaderboard,
  normalizeToken,
  normalizeName,
};
