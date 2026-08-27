/**
 * Store staff only — developer accounts use /api/developer/*.
 */
function restrictToBusinessStaff(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role === 'developer') {
    return res.status(403).json({
      error: 'Developer accounts cannot access store APIs. Use the developer console.',
    });
  }
  if (!req.user.business_id) {
    return res.status(403).json({ error: 'This account is not linked to a business.' });
  }
  next();
}

/** Reject sync/API payloads that belong to another store. */
function assertRecordTenant(record, businessId, label = 'Record') {
  if (!record || typeof record !== 'object') {
    return { ok: false, error: `${label} is invalid.` };
  }
  if (record.business_id && record.business_id !== businessId) {
    return { ok: false, error: `${label} belongs to another store and was rejected.` };
  }
  return { ok: true };
}

module.exports = { restrictToBusinessStaff, assertRecordTenant };
