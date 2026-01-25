const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const monitor = require('../monitor');

const prisma = new PrismaClient();

module.exports = async function requireAuth(req, res, next) {
  const h = String(req.get('authorization') || '');
  let token = null;
  if (h.startsWith('Bearer ')) token = h.slice('Bearer '.length).trim();
  if (!token && req.cookies && req.cookies.token) token = req.cookies.token;

  if (!token) {
    try { monitor.recordFailedAuth(); } catch (e) { }
    return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
  }

  // legacy: token is just a userId (no dots)
  if (!token.includes('.')) {
    try {
      const user = await prisma.user.findUnique({ where: { id: token }, select: { id: true, name: true, email: true, role: true } });
      if (!user) {
        try { monitor.recordFailedAuth(); } catch (e) { }
        return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      }
      req.user = user;
      return next();
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  }

  // token looks like JWT
  const secret = process.env.JWT_SECRET || 'dev-secret';
  try {
    const payload = jwt.verify(token, secret);
    // If JWT contains an `id`, prefer loading fresh user record
    if (payload && payload.id) {
      try {
        const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, name: true, email: true, role: true } });
        req.user = user || payload;
      } catch (e) {
        req.user = payload;
      }
    } else {
      req.user = payload;
    }
    return next();
  } catch (e) {
    try { monitor.recordFailedAuth(); } catch (er) { }
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }
};
