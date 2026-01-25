const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'alerts_state.json');

function load() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8') || '{}');
  } catch (e) { return {}; }
}

function save(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) { }
}

function keyFor(licenseKey, eventKey, fingerprint) {
  return `${String(licenseKey || '')}::${String(eventKey || '')}::${String(fingerprint || '')}`;
}

// cooldownHours default 24
function shouldSendAlert(licenseKey, eventKey, fingerprint, cooldownHours = 24) {
  try {
    const state = load();
    const k = keyFor(licenseKey, eventKey, fingerprint);
    const entry = state[k];
    if (!entry) return true;
    const last = new Date(entry.time);
    const now = new Date();
    const diffHours = (now - last) / (1000 * 60 * 60);
    return diffHours >= Number(cooldownHours);
  } catch (e) { return true; }
}

function markSentAlert(licenseKey, eventKey, fingerprint) {
  try {
    const state = load();
    const k = keyFor(licenseKey, eventKey, fingerprint);
    state[k] = { time: new Date().toISOString() };
    save(state);
  } catch (e) { }
}

module.exports = { shouldSendAlert, markSentAlert };
