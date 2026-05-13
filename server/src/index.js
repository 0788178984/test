require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./logger');

const PLACEHOLDER_JWT = 'your-secret-key-change-in-production';
if (process.env.NODE_ENV === 'production') {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === PLACEHOLDER_JWT) {
    logger.error('FATAL: Set a strong JWT_SECRET in production (not the placeholder).');
    process.exit(1);
  }
}

const cron = require('node-cron');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const salesRoutes = require('./routes/sales');
const customerRoutes = require('./routes/customers');
const supplierRoutes = require('./routes/suppliers');
const userRoutes = require('./routes/users');
const inventoryRoutes = require('./routes/inventory');
const reportsRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const syncRoutes = require('./routes/sync');
const developerRoutes = require('./routes/developer');
const supportRequestRoutes = require('./routes/supportRequests');
const paymentRoutes = require('./routes/payments');

// Import services
const { dispatch, createNotification } = require('./routes/notifications');
const { runDailyLicenseReminders } = require('./services/licenseAlertService');

// Import database
const db = require('./db/connection');
const { DEFAULT_BUSINESS_ID } = require('./db/multiTenantMigrate');
const { authenticate, authorize } = require('./middleware/auth');
const { classifyLicenseStates } = require('./services/licenseAlertService');

const app = express();
const PORT = process.env.PORT || 4000;

if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : null;

// Security headers (CSP disabled so Vite / SPA inline scripts still work when served from this process)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Middleware — permissive CORS when ALLOWED_ORIGINS is unset (local dev); restrict in production via .env
app.use(
  allowedOrigins && allowedOrigins.length
    ? cors({
        origin: (origin, cb) => {
          if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
          return cb(null, false);
        },
      })
    : cors()
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_API_MAX || 2000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = req.path || '';
    return p === '/health' || p === '/api/notifications/stream' || p.endsWith('/notifications/stream');
  },
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 80),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
  },
});

app.use(globalLimiter);

// Request logging
app.use((req, res, next) => {
  logger.debug(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Root JSON hint — dev only. In production, `/` is served by `client/dist` (SPA); this route would win over static if registered here.
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (req, res) => {
    res.json({
      service: 'Uganda Supermarket API',
      message:
        'Use the web app at http://localhost:5173/ — this server exposes JSON under /api/...',
      health: '/health',
    });
  });
}

// Developer licence dashboard (explicit mount so it is never shadowed by router internals)
app.get('/api/developer/license-alerts', authenticate, authorize('developer'), (req, res) => {
  try {
    const { out_of_licence, expiring_soon, expiring_this_month } = classifyLicenseStates();
    res.json({
      out_of_licence,
      expiring_soon,
      expiring_this_month,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('license-alerts error:', e);
    res.status(500).json({ error: 'Failed to compute licence alerts.' });
  }
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/support-requests', supportRequestRoutes);
app.use('/api/payments', paymentRoutes);

// Static files for client (in production)
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '../../client/dist');
  app.use(express.static(distDir));

  // SPA fallback — Express 5 / path-to-regexp rejects app.get('*', ...); use middleware instead.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// CRON JOBS

// Daily 7:25 AM — licence / subscription reminders (developer digest + store admins)
cron.schedule('25 7 * * *', () => {
  try {
    runDailyLicenseReminders(createNotification);
    logger.info('Daily licence reminder job finished.');
  } catch (error) {
    logger.error('Daily licence reminder job error:', error);
  }
});

// Every day at 8:00 AM — check expiry dates
cron.schedule('0 8 * * *', async () => {
  logger.info('Running expiry check job...');

  try {
    const expiring = db.prepare(`
      SELECT * FROM products
      WHERE expiry_date IS NOT NULL
      AND current_stock > 0
      AND date(expiry_date) <= date('now', '+7 days')
      AND deleted_at IS NULL
    `).all();

    for (const product of expiring) {
      const isExpired = new Date(product.expiry_date) < new Date();
      const eventType = isExpired ? 'EXPIRY_EXPIRED' : 'EXPIRY_WARNING';

      dispatch(
        eventType,
        {
          product_name: product.name,
          date: product.expiry_date,
          product_id: product.id,
        },
        { business_id: product.business_id }
      );
    }

    logger.info(`Expiry check completed. Found ${expiring.length} products.`);
  } catch (error) {
    logger.error('Expiry check job error:', error);
  }
});

// Every day at 9:00 PM — daily summary
cron.schedule('0 21 * * *', async () => {
  logger.info('Running daily summary job...');

  try {
    const today = new Date().toISOString().split('T')[0];
    const businesses = db.prepare(`SELECT id FROM businesses`).all();

    for (const b of businesses) {
      const summary = db.prepare(`
      SELECT COUNT(*) as count,
             SUM(total_amount) as revenue,
             SUM(total_amount - (SELECT SUM(si.quantity * si.buying_price)
                                FROM sale_items si WHERE si.sale_id = s.id)) as profit
      FROM sales s
      WHERE date(created_at) = ? AND status = 'completed' AND business_id = ?
    `).get(today, b.id);

      const topProduct = db.prepare(`
      SELECT p.name, SUM(si.quantity) as qty
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      WHERE date(s.created_at) = ? AND s.status = 'completed' AND s.business_id = ?
      GROUP BY si.product_id
      ORDER BY qty DESC
      LIMIT 1
    `).get(today, b.id);

      dispatch(
        'DAILY_SUMMARY',
        {
          date: today,
          count: summary.count || 0,
          total: (summary.revenue || 0).toLocaleString(),
          profit: (summary.profit || 0).toLocaleString(),
          top_product: topProduct?.name || 'N/A',
        },
        { business_id: b.id }
      );
    }

    logger.info('Daily summary job completed.');
  } catch (error) {
    logger.error('Daily summary job error:', error);
  }
});

// Every 5 minutes — low stock check
cron.schedule('*/5 * * * *', async () => {
  try {
    const lowStock = db.prepare(`
      SELECT * FROM products
      WHERE current_stock <= minimum_stock
      AND is_active = 1
      AND deleted_at IS NULL
    `).all();

    for (const product of lowStock) {
      const recent = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'low_stock'
        AND json_extract(meta, '$.product_id') = ?
        AND business_id = ?
        AND created_at > datetime('now', '-24 hours')
      `).get(product.id, product.business_id);

      if (!recent) {
        dispatch(
          'LOW_STOCK',
          {
            product_name: product.name,
            qty: product.current_stock,
            unit: product.unit,
            product_id: product.id,
          },
          { business_id: product.business_id }
        );
      }
    }
  } catch (error) {
    logger.error('Low stock check error:', error);
  }
});

// Start server (optional one-time seed for hosts without Shell, e.g. Render free tier)
const wantsSeedIfEmpty =
  process.env.SEED_IF_EMPTY === '1' ||
  process.env.SEED_IF_EMPTY === 'true' ||
  process.env.SEED_IF_EMPTY === 'yes';

/** On Render / NODE_ENV=production, demo seed is opt-in so redeploys do not wipe real tenants. */
const allowAutoDemoSeedOnProd =
  process.env.ALLOW_AUTO_DEMO_SEED === '1' ||
  process.env.ALLOW_AUTO_DEMO_SEED === 'true' ||
  process.env.ALLOW_AUTO_DEMO_SEED === 'yes';

const isProdLikeHost =
  process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

const runSeedIfEmpty = wantsSeedIfEmpty && (!isProdLikeHost || allowAutoDemoSeedOnProd);

(async () => {
  if (wantsSeedIfEmpty && !runSeedIfEmpty) {
    logger.warn(
      'SEED_IF_EMPTY is set but demo auto-seed is skipped on production/Render. Without a Persistent Disk + DB_PATH, SQLite is recreated empty each deploy — attach a disk, set DB_PATH to a file on it, then redeploy. For a one-time demo seed here only, set ALLOW_AUTO_DEMO_SEED=1 (then remove it).'
    );
  }

  if (runSeedIfEmpty) {
    try {
      const userCount = db.prepare(`SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL`).get().c;
      const nonDefaultBiz = db
        .prepare(`SELECT COUNT(*) as c FROM businesses WHERE id != ?`)
        .get(DEFAULT_BUSINESS_ID).c;

      const counts = db
        .prepare(
          `
          SELECT
            (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) AS products,
            (SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL) AS sales,
            (SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL) AS customers,
            (SELECT COUNT(*) FROM suppliers WHERE deleted_at IS NULL) AS suppliers
        `
        )
        .get();
      const hasBusinessRows =
        (counts.products || 0) +
          (counts.sales || 0) +
          (counts.customers || 0) +
          (counts.suppliers || 0) >
        0;

      if (userCount > 0) {
        logger.info('SEED_IF_EMPTY: users already exist; skipping seed.');
      } else if (nonDefaultBiz > 0) {
        logger.warn(
          'SEED_IF_EMPTY: database has tenant business(es) but no users — skipping destructive demo seed. ' +
            'Use Developer Console → bootstrap admin for each store, or run `FORCE_SEED=1 node src/db/seed.js` only if you intend a full wipe.'
        );
      } else if (hasBusinessRows) {
        logger.warn(
          'SEED_IF_EMPTY: database already has products, sales, customers, or suppliers — skipping demo seed to avoid data loss.'
        );
      } else {
        logger.warn('SEED_IF_EMPTY: empty database; running one-time demo seed...');
        if (process.env.RENDER === 'true') {
          logger.warn(
            'RENDER: Each deploy starts with a fresh SQLite file unless DB_PATH points to a Render Persistent Disk. ' +
              'With ALLOW_AUTO_DEMO_SEED enabled, an empty DB triggers this demo seed every time — that is why users and data disappear. ' +
              'Mount a disk, set DB_PATH to a path on that volume (e.g. /var/data/supermarket.db), redeploy, then remove ALLOW_AUTO_DEMO_SEED (and SEED_IF_EMPTY when you are done bootstrapping).'
          );
        }
        const seedDatabase = require('./db/seed');
        await seedDatabase({ skipGuard: true });
        logger.warn('SEED_IF_EMPTY: seed finished. Remove SEED_IF_EMPTY from env after first deploy if you want.');
      }
    } catch (e) {
      logger.error('SEED_IF_EMPTY bootstrap failed:', e);
    }
  }

  app.listen(PORT, () => {
    logger.warn(
      `Uganda Supermarket Server listening on port ${PORT} (env=${process.env.NODE_ENV || 'development'}, log=${logger.level})`
    );
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Database file: ${db.name}`);
    if (process.env.RENDER === 'true' && !(process.env.DB_PATH || '').trim()) {
      logger.warn(
        'RENDER: DB_PATH is unset — default SQLite is usually on an ephemeral disk and is lost on every deploy. Add a Render Persistent Disk, set DB_PATH to a path on that volume (e.g. /var/data/supermarket.db), redeploy, then create stores once.'
      );
    }
  });
})();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.warn('Shutting down server (SIGINT)...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.warn('Shutting down server (SIGTERM)...');
  db.close();
  process.exit(0);
});

module.exports = app;
