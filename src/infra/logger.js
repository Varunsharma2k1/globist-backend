/** Tiny leveled JSON-ish logger. Swap for pino later without touching callers. */
const env = require('../config/env');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[env.logLevel] ?? LEVELS.info;

function log(level, msg, meta) {
  if (LEVELS[level] < min) return;
  const line = env.isProd
    ? JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta })
    : `[${level}] ${msg}${meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

const logger = {
  debug: (m, meta) => log('debug', m, meta),
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
  child: (base) => ({
    debug: (m, meta) => log('debug', m, { ...base, ...meta }),
    info: (m, meta) => log('info', m, { ...base, ...meta }),
    warn: (m, meta) => log('warn', m, { ...base, ...meta }),
    error: (m, meta) => log('error', m, { ...base, ...meta }),
  }),
};

module.exports = logger;
