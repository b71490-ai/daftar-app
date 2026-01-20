const TRADER_KEY = "daftar_trader";
const SESSION_KEY = "daftar_session";

export function getTrader() {
  try {
    const s = localStorage.getItem(TRADER_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function saveTrader(trader) {
  localStorage.setItem(TRADER_KEY, JSON.stringify(trader));
}

export function getSession() {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function login(phone, password) {
  const trader = getTrader();
  if (!trader) return { ok: false, msg: "لا يوجد حساب، سجّل أولاً." };

  if (String(trader.phone) !== String(phone).trim()) {
    return { ok: false, msg: "رقم الجوال غير صحيح." };
  }
  if (String(trader.password) !== String(password)) {
    return { ok: false, msg: "كلمة المرور غير صحيحة." };
  }

  const session = {
    traderId: trader.id,
    loggedInAt: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, trader };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

// Mark last successful verification time for offline allowance
export function setLastVerified(dateIso) {
  try {
    const t = getTrader();
    if (!t) return null;
    t.lastVerifiedAt = dateIso || new Date().toISOString();
    saveTrader(t);
    return t;
  } catch {
    return null;
  }
}

// Returns true when app may operate offline based on last verification (7 days)
export function allowedOffline() {
  try {
    const t = getTrader();
    if (!t) return false;
    // If fully activated and not expired -> allowed
    if (t.deviceId && t.deviceId === t.id && t.expiresAt && new Date(t.expiresAt) > new Date()) return true;
    if (!t.lastVerifiedAt) return false;
    const last = new Date(t.lastVerifiedAt);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return last > cutoff;
  } catch {
    return false;
  }
}

export function getPlan() {
  try { const t = getTrader(); return t?.plan || null; } catch { return null; }
}