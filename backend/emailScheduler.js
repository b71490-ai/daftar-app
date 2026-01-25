const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sendAlert } = require('./utils/notifier');
const { ADMIN_EMAIL, DB_PATH } = require('./config');

const DB = DB_PATH;
const STATE_FILE = path.join(__dirname, 'alerts_state.json');

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) { return {}; }
}

function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch (e) { }
}

function fetchLicenses() {
  try {
    const out = execSync(`sqlite3 -json ${DB} "SELECT key, status, expiresAt, deviceId FROM License;"`, { cwd: __dirname }).toString();
    return JSON.parse(out || '[]');
  } catch (e) {
    return [];
  }
}

function daysUntil(dateStr) {
  try {
    if (!dateStr) return null;
    const now = new Date();
    const d = new Date(dateStr);
    return Math.ceil((d - now) / (24 * 60 * 60 * 1000));
  } catch (e) { return null; }
}

async function scanAndSend() {
  try {
    const licenses = fetchLicenses();
    if (!licenses || !licenses.length) return;
    const state = loadState();
    const thresholds = [7, 3, 1];

    for (const lic of licenses) {
      try {
        const key = lic.key;
        const status = String(lic.status || '').toLowerCase();
        if (!['active','used','locked'].includes(status)) continue; // only alert for active/used/locked
        const days = daysUntil(lic.expiresAt);
        if (days === null) continue;
        for (const t of thresholds) {
          if (days === t) {
            const sentKey = `${key}::${t}`;
            if (state[sentKey]) continue; // already sent
            // send subscription alert
            try {
              await sendAlert({
                to: ADMIN_EMAIL,
                subject: 'تنبيه اشتراك',
                license: key,
                customerName: null,
                customerId: lic.deviceId || null,
                status: lic.status || null,
                expiresAt: lic.expiresAt || null,
                time: new Date().toISOString(),
                eventType: `subscription_alert_${t}d`,
                extra: `المتبقي: ${t} يوم`,
              });
            } catch (e) { /* ignore send errors */ }
            state[sentKey] = { time: new Date().toISOString() };
            saveState(state);
          }
        }
        // If expired and not yet alerted about expiry, send one final expired alert
        if (days <= 0) {
          const sentKey = `${key}::expired`;
          if (!state[sentKey]) {
            try {
              await sendAlert({
                to: ADMIN_EMAIL,
                subject: 'تنبيه اشتراك',
                license: key,
                customerName: null,
                customerId: lic.deviceId || null,
                status: lic.status || null,
                expiresAt: lic.expiresAt || null,
                time: new Date().toISOString(),
                eventType: 'subscription_expired',
                extra: `السيريال منتهي`,
              });
            } catch (e) { }
            state[sentKey] = { time: new Date().toISOString() };
            saveState(state);
          }
        }
      } catch (e) { /* per-license ignore */ }
    }
  } catch (e) { /* ignore scheduler top-level errors */ }
}

function startScheduler({ intervalMs = 24 * 60 * 60 * 1000, runOnStart = true } = {}) {
  // run immediately if requested
  if (runOnStart) scanAndSend();
  // set daily interval
  setInterval(scanAndSend, intervalMs);
}

module.exports = { startScheduler, scanAndSend };
