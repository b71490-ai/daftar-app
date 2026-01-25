module.exports = function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

  if (String((req.user.role || '')).toUpperCase() === 'ADMIN') return next();

  // Optional fallback: allow specific admin email via env
  // if (req.user.email === process.env.ADMIN_EMAIL) return next();

  return res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
};
