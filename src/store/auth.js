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

export async function login(email, password) {
  try {
    const res = await fetch((window.__env && window.__env.API_URL) ? `${window.__env.API_URL.replace(/\/$/, '')}/api/login` : '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Try admin login as a fallback (same form for admin)
      try {
        const r2 = await fetch((window.__env && window.__env.API_URL) ? `${window.__env.API_URL.replace(/\/$/, '')}/api/admin-login` : '/api/admin-login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
        });
        const b2 = await r2.json().catch(() => ({}));
        if (r2.ok && b2.ok && b2.user) {
          const trader = b2.user;
          try { localStorage.setItem(TRADER_KEY, JSON.stringify(trader)); } catch (e) { }
          const session = { traderId: trader.id, loggedInAt: new Date().toISOString() };
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
          return { ok: true, trader };
        }
      } catch (e) { /* ignore admin-login attempt errors */ }
      return { ok: false, msg: body.message || body.error || 'فشل تسجيل الدخول' };
    }
    const trader = body.trader;
    if (!trader) return { ok: false, msg: 'فشل تسجيل الدخول' };

    try { localStorage.setItem(TRADER_KEY, JSON.stringify(trader)); } catch (e) { }
    const session = { traderId: trader.id, loggedInAt: new Date().toISOString() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    // Initialize trial on first login: 10 days
    try {
      if (!trader.expiresAt) {
        const now = new Date();
        trader.trialStartedAt = now.toISOString();
        trader.expiresAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
        saveTrader(trader);
      }
    } catch (e) { }

    return { ok: true, trader };
  } catch (e) {
    return { ok: false, msg: 'فشل في الاتصال بالخادم' };
  }
}

export function logout() {
  try {
    const t = getTrader();
    // If current trader is ADMIN, preserve trader and session unless explicit removal desired
    // previously we preserved admin sessions here; that prevents logout button from working.
    // Always remove session and trader on logout so UI behaves as expected.
  } catch (e) { }
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
  try { localStorage.removeItem(TRADER_KEY); } catch (e) { }
}

// Enforce expiry: if trader.expiresAt is in the past, mark plan as 'expired', set licenseStatus, and logout.
export function enforceExpiry() {
  try {
    const t = getTrader();
    if (!t || !t.expiresAt) return false;
    // Admin accounts are exempt from expiry
    try { if (String(t.role || '').toUpperCase() === 'ADMIN') return false; } catch (e) { }
    const exp = new Date(t.expiresAt);
    if (exp > new Date()) return false;
    // mark expired
    t.plan = 'expired';
    t.expiredAt = new Date().toISOString();
    saveTrader(t);
    try { localStorage.setItem('licenseStatus', 'blocked'); } catch (e) { }
    logout();
    return true;
  } catch (e) { return false; }
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
    // Allow during active trial as well
    if (t.plan === 'trial' && t.expiresAt && new Date(t.expiresAt) > new Date()) return true;
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