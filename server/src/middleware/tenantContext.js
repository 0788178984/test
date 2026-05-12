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

module.exports = { restrictToBusinessStaff };
