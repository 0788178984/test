const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');

const router = express.Router();

const GUIDE_PATH = path.join(__dirname, '../../../docs/USER_GUIDE.md');

router.use(authenticate, restrictToBusinessStaff);

router.get('/user-guide', (req, res) => {
  try {
    if (!fs.existsSync(GUIDE_PATH)) {
      return res.status(404).json({ error: 'User guide file not found.' });
    }
    const content = fs.readFileSync(GUIDE_PATH, 'utf8');
    res.json({
      title: 'Uganda Supermarket Manager — User Guide',
      content,
      updated_at: fs.statSync(GUIDE_PATH).mtime.toISOString(),
    });
  } catch (error) {
    console.error('Get user guide error:', error);
    res.status(500).json({ error: 'Failed to load user guide.' });
  }
});

module.exports = router;
