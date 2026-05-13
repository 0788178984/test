const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const { paymentMethodsAvailability } = require('../services/paymentConfigService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function subscriptionBlocks(user) {
  if (user.role === 'developer' || !user.business_id) return false;
  const sub = user.subscription_status || 'trial';
  if (sub === 'suspended' || sub === 'expired') return true;
  const expires = user.subscription_expires_at ? new Date(user.subscription_expires_at) : null;
  if (!expires || Number.isNaN(expires.getTime())) return false;
  return expires < new Date();
}

function isSuspendedExemptPath(urlPath) {
  const p = urlPath.split('?')[0];
  return (
    p === '/api/auth/login' ||
    p === '/api/auth/login-web' ||
    p === '/api/auth/me' ||
    p === '/api/auth/logout' ||
    p.startsWith('/api/developer/') ||
    p.startsWith('/api/support-requests') ||
    p === '/api/notifications/stream'
  );
}

function getBearerOrQueryToken(req) {
  const header = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (header && header.trim()) return header.trim();

  let q = req.query?.token;
  if (Array.isArray(q)) q = q[0];
  if (typeof q === 'string' && q.trim()) return q.trim();

  const raw = req.url || req.originalUrl || '';
  const m = raw.match(/[?&]token=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]).trim();
    } catch {
      return m[1].trim();
    }
  }
  return '';
}

// Authentication middleware
const authenticate = (req, res, next) => {
  try {
    const token = getBearerOrQueryToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = db
      .prepare(
        `
      SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.business_id,
             b.name as business_name,
             b.business_code,
             b.subscription_status,
             b.subscription_expires_at,
             b.payment_config as payment_config
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.id = ? AND u.deleted_at IS NULL
    `
      )
      .get(decoded.userId);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid token or user inactive.' });
    }

    const pc = user.payment_config;
    delete user.payment_config;
    user.payment_methods = user.business_id
      ? paymentMethodsAvailability(pc)
      : { cash: true, mtn_momo: false, airtel_money: false };

    const path = req.originalUrl.split('?')[0];
    if (subscriptionBlocks(user) && !isSuspendedExemptPath(path)) {
      return res.status(403).json({
        error: 'Subscription inactive or suspended. Contact your system provider.',
        code: 'SUBSCRIPTION_INACTIVE',
        subscription_status: user.subscription_status,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

// Role-based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    next();
  };
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '8h' });
};

module.exports = {
  authenticate,
  authorize,
  generateToken,
  subscriptionBlocks,
  isSuspendedExemptPath,
};
