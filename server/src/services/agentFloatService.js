const db = require('../db/connection');
const { newId } = require('../db/ids');
const { roundUgx } = require('../utils/money');
const { getStoreToday } = require('../utils/storeTime');

const TX_TYPES = ['withdrawal', 'deposit', 'airtime', 'bill_payment', 'send_money'];
const NETWORKS = ['mtn', 'airtel'];

function deltasForType(transactionType, amount) {
  const a = roundUgx(amount);
  if (a <= 0) throw new Error('Amount must be greater than zero.');

  switch (transactionType) {
    case 'withdrawal':
      return { cash_delta: a, float_delta: -a };
    case 'deposit':
      return { cash_delta: -a, float_delta: a };
    case 'airtime':
    case 'bill_payment':
    case 'send_money':
      return { cash_delta: a, float_delta: -a };
    default:
      throw new Error('Invalid transaction type.');
  }
}

async function getSessionById(sessionId, businessId) {
  return db
    .prepare(
      `SELECT s.*, u.name as cashier_name
       FROM agent_float_sessions s
       JOIN users u ON u.id = s.cashier_id
       WHERE s.id = ? AND s.business_id = ?`
    )
    .get(sessionId, businessId);
}

async function getOpenSession(businessId, cashierId, sessionDate = getStoreToday()) {
  return db
    .prepare(
      `SELECT s.*, u.name as cashier_name
       FROM agent_float_sessions s
       JOIN users u ON u.id = s.cashier_id
       WHERE s.business_id = ? AND s.cashier_id = ? AND s.session_date = ?`
    )
    .get(businessId, cashierId, sessionDate);
}

async function sumTransactions(sessionId) {
  const row = await db
    .prepare(
      `SELECT
        COALESCE(SUM(cash_delta), 0) as cash_movement,
        COALESCE(SUM(float_delta), 0) as float_movement,
        COALESCE(SUM(commission), 0) as total_commission,
        COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as withdrawals,
        COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as deposits
       FROM agent_transactions
       WHERE session_id = ? AND deleted_at IS NULL`
    )
    .get(sessionId);

  return {
    cash_movement: roundUgx(row?.cash_movement),
    float_movement: roundUgx(row?.float_movement),
    total_commission: roundUgx(row?.total_commission),
    withdrawals: roundUgx(row?.withdrawals),
    deposits: roundUgx(row?.deposits),
  };
}

async function buildSessionBalances(session) {
  const sums = await sumTransactions(session.id);
  const opening_cash = roundUgx(session.opening_cash);
  const opening_float = roundUgx(session.opening_float);
  const current_cash = opening_cash + sums.cash_movement;
  const current_float = opening_float + sums.float_movement;

  return {
    session,
    opening_cash,
    opening_float,
    current_cash,
    current_float,
    expected_closing_cash: current_cash,
    expected_closing_float: current_float,
    total_withdrawals: sums.withdrawals,
    total_deposits: sums.deposits,
    total_commission: sums.total_commission,
    ...sums,
  };
}

async function openSession(businessId, cashierId, { opening_cash, opening_float, session_date }) {
  const date = session_date || getStoreToday();
  const existing = await getOpenSession(businessId, cashierId, date);
  if (existing) {
    throw new Error('A float session already exists for today. Use the existing session or ask a supervisor.');
  }

  const id = newId('afs');
  await db
    .prepare(
      `INSERT INTO agent_float_sessions (
        id, business_id, cashier_id, session_date,
        opening_cash, opening_float, status, opened_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'), datetime('now'))`
    )
    .run(id, businessId, cashierId, date, roundUgx(opening_cash), roundUgx(opening_float));

  return getSessionById(id, businessId);
}

async function recordTransaction(session, userId, payload) {
  if (session.status !== 'open') {
    throw new Error('Session is closed. Open a new day’s float to record transactions.');
  }

  const type = String(payload.transaction_type || '').toLowerCase();
  const network = String(payload.network || '').toLowerCase();
  if (!TX_TYPES.includes(type)) throw new Error('Invalid transaction type.');
  if (!NETWORKS.includes(network)) throw new Error('Network must be mtn or airtel.');

  const amount = roundUgx(payload.amount);
  const commission = roundUgx(payload.commission || 0);
  const { cash_delta, float_delta } = deltasForType(type, amount);

  const id = newId('atx');
  await db
    .prepare(
      `INSERT INTO agent_transactions (
        id, session_id, business_id, cashier_id, transaction_type, network,
        amount, commission, cash_delta, float_delta,
        customer_name, customer_phone, reference, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      id,
      session.id,
      session.business_id,
      userId,
      type,
      network,
      amount,
      commission,
      cash_delta,
      float_delta,
      payload.customer_name || null,
      payload.customer_phone || null,
      payload.reference || null,
      payload.notes || null
    );

  return db
    .prepare(
      `SELECT t.*, u.name as cashier_name
       FROM agent_transactions t
       JOIN users u ON u.id = t.cashier_id
       WHERE t.id = ?`
    )
    .get(id);
}

async function listTransactions(sessionId, { limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT t.*, u.name as cashier_name
       FROM agent_transactions t
       JOIN users u ON u.id = t.cashier_id
       WHERE t.session_id = ? AND t.deleted_at IS NULL
       ORDER BY t.created_at DESC
       LIMIT ?`
    )
    .all(sessionId, parseInt(limit, 10));
}

async function closeSession(session, userId, { closing_cash_actual, closing_float_actual, notes }) {
  const balances = await buildSessionBalances(session);
  const actualCash = roundUgx(closing_cash_actual);
  const actualFloat = roundUgx(closing_float_actual);
  const cash_variance = actualCash - balances.expected_closing_cash;
  const float_variance = actualFloat - balances.expected_closing_float;

  await db
    .prepare(
      `UPDATE agent_float_sessions SET
        status = 'closed',
        closing_cash_actual = ?,
        closing_float_actual = ?,
        cash_variance = ?,
        float_variance = ?,
        notes = COALESCE(?, notes),
        closed_at = datetime('now'),
        updated_at = datetime('now')
       WHERE id = ? AND business_id = ?`
    )
    .run(actualCash, actualFloat, cash_variance, float_variance, notes || null, session.id, session.business_id);

  return {
    ...(await buildSessionBalances(await getSessionById(session.id, session.business_id))),
    closing_cash_actual: actualCash,
    closing_float_actual: actualFloat,
    cash_variance,
    float_variance,
  };
}

async function softDeleteTransaction(txId, businessId, deletedBy, role) {
  if (!['admin', 'manager'].includes(role)) {
    throw new Error('Only admin or manager can void agent transactions.');
  }
  const tx = await db
    .prepare(`SELECT id FROM agent_transactions WHERE id = ? AND business_id = ? AND deleted_at IS NULL`)
    .get(txId, businessId);
  if (!tx) throw new Error('Transaction not found.');

  await db
    .prepare(
      `UPDATE agent_transactions SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ? AND business_id = ?`
    )
    .run(deletedBy, txId, businessId);
}

module.exports = {
  TX_TYPES,
  NETWORKS,
  deltasForType,
  getOpenSession,
  getSessionById,
  buildSessionBalances,
  openSession,
  recordTransaction,
  listTransactions,
  closeSession,
  softDeleteTransaction,
};
