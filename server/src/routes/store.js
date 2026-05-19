const express = require('express');
const { authenticate } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { getStoreToday, addStoreDays, STORE_TZ } = require('../utils/storeTime');

const router = express.Router();

router.use(authenticate, restrictToBusinessStaff);

/** Store calendar day (same boundary as sales/reports "today"). */
router.get('/calendar', (req, res) => {
  const today = getStoreToday();
  res.json({
    today,
    yesterday: addStoreDays(today, -1),
    timezone: STORE_TZ,
  });
});

module.exports = router;
