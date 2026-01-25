// Simple in-memory cache with TTL
const store = new Map();

function set(key, value, ttlMs) {
  const expires = Date.now() + (ttlMs || 0);
  store.set(key, { value, expires });
}

function get(key) {
  const ent = store.get(key);
  if (!ent) return null;
  if (ent.expires && Date.now() > ent.expires) {
    store.delete(key);
    return null;
  }
  return ent.value;
}

function del(key) { store.delete(key); }

module.exports = { set, get, del };
