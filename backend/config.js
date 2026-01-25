require('dotenv/config');
const path = require('path');

const NODE_ENV = String(process.env.NODE_ENV || 'development');
const IS_PROD = NODE_ENV === 'production';

// Default admin email: prefer env, fall back to ALERT_TO, then local dev admin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.ALERT_TO || 'b71490@gmail.com';
const ALERT_FROM = process.env.ALERT_FROM || `no-reply@${process.env.APP_HOST || 'daftar.local'}`;
const SMTP = {
  host: process.env.SMTP_HOST || null,
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
  user: process.env.SMTP_USER || null,
  pass: process.env.SMTP_PASS || null,
  secure: String(process.env.SMTP_SECURE || 'false') === 'true'
};

// DB path can be overridden by env (absolute or relative). Default to dev.db for development
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, IS_PROD ? 'prod.db' : 'dev.db');

// Backup/config defaults
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(__dirname, 'backups');
const BACKUP_ENCRYPT = String(process.env.BACKUP_ENCRYPT || (IS_PROD ? 'true' : 'false')) === 'true';
const ENABLE_BACKUPS = String(process.env.ENABLE_BACKUPS || (IS_PROD ? 'true' : 'false')) === 'true';
const ENABLE_SCHEDULERS = String(process.env.ENABLE_SCHEDULERS || (IS_PROD ? 'true' : 'false')) === 'true';
// Caching TTLs (milliseconds)
const CACHE_TTL_LICENSES = Number(process.env.CACHE_TTL_LICENSES || 10 * 1000); // 10s default
const CACHE_TTL_BACKUPS = Number(process.env.CACHE_TTL_BACKUPS || 60 * 1000); // 60s default
const CACHE_TTL_ACTIVITY = Number(process.env.CACHE_TTL_ACTIVITY || 5 * 1000); // 5s default
// Monitoring defaults
const MONITORING_ENABLED = String(process.env.MONITORING_ENABLED || (IS_PROD ? 'true' : 'true')) === 'true';
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || 800); // consider >800ms slow
const ERROR_ALERT_THRESHOLD = Number(process.env.ERROR_ALERT_THRESHOLD || 10); // errors in window
const FAILED_LOGIN_THRESHOLD = Number(process.env.FAILED_LOGIN_THRESHOLD || 20); // failed auth attempts
const MONITOR_WINDOW_MS = Number(process.env.MONITOR_WINDOW_MS || (60 * 60 * 1000)); // 1 hour window
const MONITOR_ALERT_COOLDOWN_HOURS = Number(process.env.MONITOR_ALERT_COOLDOWN_HOURS || 24);

module.exports = { NODE_ENV, IS_PROD, ADMIN_EMAIL, ALERT_FROM, SMTP, DB_PATH, BACKUP_DIR, BACKUP_ENCRYPT, ENABLE_BACKUPS, ENABLE_SCHEDULERS, CACHE_TTL_LICENSES, CACHE_TTL_BACKUPS, CACHE_TTL_ACTIVITY, MONITORING_ENABLED, SLOW_REQUEST_MS, ERROR_ALERT_THRESHOLD, FAILED_LOGIN_THRESHOLD, MONITOR_WINDOW_MS, MONITOR_ALERT_COOLDOWN_HOURS };

// WhatsApp admin number (short number provided)
module.exports.ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '779992669';
