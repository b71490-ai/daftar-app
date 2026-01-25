require('dotenv/config');
const config = require('./config');

const SENSITIVE_KEYS = [
  'SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT', 'BACKUP_PASSPHRASE',
  'BACKUP_S3_SECRET', 'BACKUP_S3_KEY', 'BACKUP_S3_BUCKET', 'JWT_SECRET',
  'DATABASE_URL', 'TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID'
];

function getEnv(key) {
  return process.env[key];
}

function getSanitizedEnv() {
  const out = {};
  Object.keys(process.env).forEach(k => {
    if (SENSITIVE_KEYS.includes(k)) return;
    out[k] = process.env[k];
  });
  return out;
}

function getPublicConfig() {
  // Return a minimal, non-sensitive view of runtime config useful for diagnostics
  return {
    NODE_ENV: config.NODE_ENV,
    IS_PROD: config.IS_PROD,
    ADMIN_EMAIL: config.ADMIN_EMAIL || null,
    ALERT_FROM: config.ALERT_FROM || null,
    BACKUP_DIR: config.BACKUP_DIR || null,
    BACKUP_ENCRYPT: config.BACKUP_ENCRYPT || false,
    ENABLE_BACKUPS: config.ENABLE_BACKUPS || false,
    ENABLE_SCHEDULERS: config.ENABLE_SCHEDULERS || false,
    DB_PATH: config.DB_PATH ? String(config.DB_PATH).replace(process.cwd(), '') : null
  };
}

module.exports = { getEnv, getSanitizedEnv, getPublicConfig, SENSITIVE_KEYS };
