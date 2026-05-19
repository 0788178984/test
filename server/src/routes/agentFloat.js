const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const { getStoreToday } = require('../utils/storeTime');
const agentFloat = require('../services/agentFloatService');

const router = express.Router();
router.use(authenticate, restrictToBusinessStaff);

const bid = (req) => req.user.business_id;

/** Cashier who may hold an agent float for this business. */
async function assertActiveStoreCashier(req, cashierId) {
  if (!cashierId) return null;
  const row = await db
    .prepare(
      `SELECT id FROM users
       WHERE id = ? AND business_id = ? AND deleted_at IS NULL
         AND is_active = 1 AND role = 'cashier'`
    )
    .get(String(cashierId), bid(req));
  return row?.id || null;
}

router.get('/session/today', checkPermission('view_agent_float'), async (req, res) => {
  try {
    const date = req.query.date || getStoreToday();
    let cashierId;
    if (req.user.role === 'cashier') {
      cashierId = req.user.id;
    } else {
      cashierId = req.query.cashier_id;
      if (!cashierId) {
        return res.status(400).json({
          error: 'Supervisors must pass cashier_id (query) to load that cashier’s float session.',
        });
      }
      const ok = await assertActiveStoreCashier(req, cashierId);
      if (!ok) {
        return res.status(400).json({ error: 'Invalid or inactive cashier for this store.' });
      }
      cashierId = ok;
    }

    const session = await agentFloat.getOpenSession(bid(req), cashierId, date);
    if (!session) {
      return res.json({ session: null, balances: null, transactions: [] });
    }

    const balances = await agentFloat.buildSessionBalances(session);
    const transactions = await agentFloat.listTransactions(session.id);

    res.json({ session, balances, transactions, date });
  } catch (error) {
    console.error('Agent float session error:', error);
    res.status(500).json({ error: error.message || 'Failed to load session.' });
  }
});

router.post('/session/open', checkPermission('manage_agent_float'), async (req, res) => {
  try {
    const { opening_cash, opening_float, session_date, cashier_id } = req.body;
    if (opening_cash === undefined || opening_float === undefined) {
      return res.status(400).json({ error: 'Opening cash and mobile money float are required.' });
    }
    if (!cashier_id) {
      return res.status(400).json({
        error: 'cashier_id is required — choose which cashier is receiving this opening float.',
      });
    }
    const targetCashier = await assertActiveStoreCashier(req, cashier_id);
    if (!targetCashier) {
      return res.status(400).json({ error: 'Invalid or inactive cashier for this store.' });
    }

    const session = await agentFloat.openSession(bid(req), targetCashier, {
      opening_cash,
      opening_float,
      session_date,
    });
    const balances = await agentFloat.buildSessionBalances(session);

    res.status(201).json({ message: 'Float session opened.', session, balances });
  } catch (error) {
    console.error('Open agent session error:', error);
    const status = error.message?.includes('already exists') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to open session.' });
  }
});

router.post('/transactions', checkPermission('record_agent_float'), async (req, res) => {
  try {
    const date = req.body.session_date || getStoreToday();
    let sessionCashierId = req.user.id;
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      sessionCashierId = req.body.cashier_id;
      if (!sessionCashierId) {
        return res.status(400).json({
          error: 'Include cashier_id (whose float this is) when recording as a supervisor.',
        });
      }
      const ok = await assertActiveStoreCashier(req, sessionCashierId);
      if (!ok) {
        return res.status(400).json({ error: 'Invalid or inactive cashier for this store.' });
      }
      sessionCashierId = ok;
    }

    let session = await agentFloat.getOpenSession(bid(req), sessionCashierId, date);
    if (!session) {
      return res.status(400).json({
        error: 'No open float for this cashier today. A supervisor must open cash + MoMo float first.',
      });
    }

    const transaction = await agentFloat.recordTransaction(session, req.user.id, req.body);
    const balances = await agentFloat.buildSessionBalances(session);

    res.status(201).json({ message: 'Transaction recorded.', transaction, balances });
  } catch (error) {
    console.error('Record agent transaction error:', error);
    res.status(400).json({ error: error.message || 'Failed to record transaction.' });
  }
});

router.post('/session/close', checkPermission('manage_agent_float'), async (req, res) => {
  try {
    const { closing_cash_actual, closing_float_actual, notes, session_date, cashier_id } = req.body;
    if (!cashier_id) {
      return res.status(400).json({
        error: 'cashier_id is required — select whose float session you are closing.',
      });
    }
    const targetCashier = await assertActiveStoreCashier(req, cashier_id);
    if (!targetCashier) {
      return res.status(400).json({ error: 'Invalid or inactive cashier for this store.' });
    }
    const session = await agentFloat.getOpenSession(
      bid(req),
      targetCashier,
      session_date || getStoreToday()
    );
    if (!session) {
      return res.status(404).json({ error: 'No open session found for this date.' });
    }
    if (closing_cash_actual === undefined || closing_float_actual === undefined) {
      return res.status(400).json({ error: 'Actual cash and mobile money counts are required.' });
    }

    const result = await agentFloat.closeSession(session, req.user.id, {
      closing_cash_actual,
      closing_float_actual,
      notes,
    });

    res.json({ message: 'Session closed and reconciled.', ...result });
  } catch (error) {
    console.error('Close agent session error:', error);
    res.status(500).json({ error: error.message || 'Failed to close session.' });
  }
});

router.delete('/transactions/:id', checkPermission('manage_agent_float'), async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admin or manager can void agent transactions.' });
    }
    await agentFloat.softDeleteTransaction(req.params.id, bid(req), req.user.id, req.user.role);
    res.json({ message: 'Transaction voided.' });
  } catch (error) {
    console.error('Void agent transaction error:', error);
    res.status(400).json({ error: error.message || 'Failed to void transaction.' });
  }
});

router.get('/report', checkPermission('view_reports'), async (req, res) => {
  try {
    const { from, to, cashier_id, network, transaction_type } = req.query;
    const fromDate = from || getStoreToday();
    const toDate = to || fromDate;

    let query = `
      SELECT t.*, u.name as cashier_name, s.session_date
      FROM agent_transactions t
      JOIN users u ON u.id = t.cashier_id
      JOIN agent_float_sessions s ON s.id = t.session_id
      WHERE t.business_id = ? AND t.deleted_at IS NULL
      AND s.session_date >= ? AND s.session_date <= ?
    `;
    const params = [bid(req), fromDate, toDate];

    if (req.user.role === 'cashier') {
      query += ` AND t.cashier_id = ?`;
      params.push(req.user.id);
    } else if (cashier_id) {
      query += ` AND t.cashier_id = ?`;
      params.push(cashier_id);
    }
    if (network) {
      query += ` AND t.network = ?`;
      params.push(String(network).toLowerCase());
    }
    if (transaction_type) {
      query += ` AND t.transaction_type = ?`;
      params.push(String(transaction_type).toLowerCase());
    }

    query += ` ORDER BY t.created_at DESC LIMIT 500`;

    const transactions = await db.prepare(query).all(...params);

    const summary = transactions.reduce(
      (acc, t) => {
        acc.total_commission += Number(t.commission) || 0;
        if (t.transaction_type === 'withdrawal') acc.withdrawals += Number(t.amount) || 0;
        if (t.transaction_type === 'deposit') acc.deposits += Number(t.amount) || 0;
        return acc;
      },
      { withdrawals: 0, deposits: 0, total_commission: 0 }
    );

    res.json({ from: fromDate, to: toDate, transactions, summary });
  } catch (error) {
    console.error('Agent float report error:', error);
    res.status(500).json({ error: 'Failed to load agent report.' });
  }
});

module.exports = router;
