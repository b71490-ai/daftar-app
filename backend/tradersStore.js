const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'traders.json');

function loadTraders() {
  try {
    if (!fs.existsSync(FILE)) return [];
    const raw = fs.readFileSync(FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) { return []; }
}

function saveTraders(list) {
  try { fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); return true; } catch (e) { return false; }
}

function getTraderById(id) {
  const list = loadTraders();
  return list.find(t => t.id === id) || null;
}

function upsertTrader(trader) {
  if (!trader || !trader.id) return null;
  const list = loadTraders();
  const idx = list.findIndex(t => t.id === trader.id);
  if (idx === -1) {
    // ensure required fields are present for new record
    const toInsert = Object.assign({}, trader, { createdAt: trader.createdAt || new Date().toISOString() });
    list.unshift(toInsert);
  } else {
    // Merge fields but do not allow clearing/removing existing email by passing null/empty
    const existing = list[idx];
    const merged = Object.assign({}, existing, trader, { updatedAt: new Date().toISOString() });
    if (existing.email && (trader.email === null || trader.email === undefined || String(trader.email).trim() === '')) {
      // keep existing email
      merged.email = existing.email;
    }
    list[idx] = merged;
  }
  saveTraders(list);
  return getTraderById(trader.id);
}

function extendTrader(id, days) {
  const list = loadTraders();
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) return null;
  const now = new Date();
  const base = list[idx].expiresAt ? new Date(list[idx].expiresAt) : now;
  const newExp = new Date(base.getTime() + (Number(days || 0) * 24 * 60 * 60 * 1000));
  list[idx].expiresAt = newExp.toISOString();
  list[idx].plan = list[idx].plan || 'trial';
  list[idx].updatedAt = new Date().toISOString();
  saveTraders(list);
  return list[idx];
}

function revertToTrial(id, days = 10) {
  const list = loadTraders();
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) return null;
  const now = new Date();
  list[idx].plan = 'trial';
  list[idx].trialStartedAt = now.toISOString();
  list[idx].expiresAt = new Date(now.getTime() + (Number(days) * 24 * 60 * 60 * 1000)).toISOString();
  list[idx].updatedAt = new Date().toISOString();
  saveTraders(list);
  return list[idx];
}

module.exports = { loadTraders, saveTraders, getTraderById, upsertTrader, extendTrader, revertToTrial };
