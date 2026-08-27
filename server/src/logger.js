/**
 * Small log helper: production defaults to warn+error unless LOG_LEVEL is set.
 * Levels: error, warn, info, debug
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const envLevel = (process.env.LOG_LEVEL || '').toLowerCase();
const defaultLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
const active = LEVELS[envLevel] !== undefined ? envLevel : defaultLevel;

function should(level) {
  return LEVELS[level] <= LEVELS[active];
}

module.exports = {
  level: active,
  error(...args) {
    console.error(...args);
  },
  warn(...args) {
    if (should('warn')) console.warn(...args);
  },
  info(...args) {
    if (should('info')) console.info(...args);
  },
  debug(...args) {
    if (should('debug')) console.log(...args);
  },
};
