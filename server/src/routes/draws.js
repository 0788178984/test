const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const db = require('../db/connection');
const { newId } = require('../db/ids');
const { roundUgx } = require('../utils/money');
const {
  DEFAULT_MIN,
  DEFAULT_REASON,
  DEFAULT_TITLE,
  presentCampaign,
  parseGifts,
  getCampaign,
  tokenSummary,
  leaderboard,
  normalizeToken,
} = require('../services/drawService');

const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

router.get('/status', async (req, res) => {
  try {
    const row = await getCampaign(req.user.business_id);
    const campaign = presentCampaign(row);
    const staffView = {
      enabled: campaign.enabled,
      title: campaign.title,
      reason: campaign.reason,
      min_amount: campaign.min_amount,
    };
    if (req.user.role === 'cashier') {
      return res.json(staffView);
    }
    return res.json({ ...campaign, saved: Boolean(row) });
  } catch (error) {
    console.error('Draw status error:', error);
    res.status(500).json({ error: 'Failed to load gift draw.' });
  }
});

router.get('/preview', async (req, res) => {
  try {
    const token = normalizeToken(req.query.token);
    if (token.length < 2) {
      return res.json({ found: false, visits: 0, total_amount: 0 });
    }
    const row = await getCampaign(req.user.business_id);
    if (!row || Number(row.enabled) !== 1) {
      return res.json({ found: false, visits: 0, total_amount: 0, active: false });
    }
    const summary = await tokenSummary(req.user.business_id, row.id, token);
    res.json({ ...summary, active: true });
  } catch (error) {
    console.error('Draw preview error:', error);
    res.status(500).json({ error: 'Failed to look up this ID.' });
  }
});

router.get('/board', authorize('admin', 'manager'), async (req, res) => {
  try {
    const row = await getCampaign(req.user.business_id);
    const campaign = presentCampaign(row);
    if (!row) {
      return res.json({
        campaign: { ...campaign, saved: false },
        participant_count: 0,
        visit_count: 0,
        pool_amount: 0,
        participants: [],
        recent: [],
      });
    }

    const board = await leaderboard(req.user.business_id, row.id);
    const recent = await db
      .prepare(
        `
        SELECT id, customer_name, customer_token, amount, sale_id, created_at
        FROM draw_entries
        WHERE business_id = ? AND campaign_id = ? AND voided = 0
        ORDER BY created_at DESC
        LIMIT 30
      `
      )
      .all(req.user.business_id, row.id);

    res.json({
      campaign: { ...campaign, saved: true },
      ...board,
      recent: recent.map((entry) => ({
        ...entry,
        amount: roundUgx(entry.amount),
      })),
    });
  } catch (error) {
    console.error('Draw board error:', error);
    res.status(500).json({ error: 'Failed to load gift draw results.' });
  }
});

router.put('/campaign', authorize('admin', 'manager'), async (req, res) => {
  try {
    const enabled = req.body.enabled ? 1 : 0;
    const title = String(req.body.title || DEFAULT_TITLE).trim().slice(0, 80) || DEFAULT_TITLE;
    const reason = String(req.body.reason || DEFAULT_REASON).trim().slice(0, 400);
    let minAmount = roundUgx(req.body.min_amount);
    if (!Number.isFinite(minAmount) || minAmount < 0) minAmount = DEFAULT_MIN;
    if (minAmount > 100000000) {
      return res.status(400).json({ error: 'Minimum amount is too large.' });
    }
    const gifts = parseGifts(req.body.gifts);
    const giftsJson = JSON.stringify(gifts.map((name) => ({ name })));
    const businessId = req.user.business_id;

    const existing = await getCampaign(businessId);
    if (!existing) {
      const id = newId('drawc');
      await db
        .prepare(
          `
          INSERT INTO draw_campaigns (
            id, business_id, enabled, title, reason, min_amount, gifts, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `
        )
        .run(id, businessId, enabled, title, reason, minAmount, giftsJson);
    } else {
      await db
        .prepare(
          `
          UPDATE draw_campaigns
          SET enabled = ?, title = ?, reason = ?, min_amount = ?, gifts = ?, updated_at = datetime('now')
          WHERE id = ? AND business_id = ?
        `
        )
        .run(enabled, title, reason, minAmount, giftsJson, existing.id, businessId);
    }

    const saved = presentCampaign(await getCampaign(businessId));
    res.json({
      message: saved.enabled
        ? 'Gift draw is on. Qualifying sales will ask for a name and ID.'
        : 'Gift draw is off. Sales continue without asking for a draw ID.',
      campaign: { ...saved, saved: true },
    });
  } catch (error) {
    console.error('Draw save error:', error);
    res.status(500).json({ error: 'Failed to save gift draw settings.' });
  }
});

module.exports = router;
