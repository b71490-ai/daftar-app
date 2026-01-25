const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middlewares/requireAuth');
const requireAdmin = require('../middlewares/requireAdmin');

const prisma = new PrismaClient();
const router = express.Router();

router.get('/admin/licenses', requireAuth, requireAdmin, async (req, res) => {
  try {
    const items = await prisma.license.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        key: true,
        status: true,
        expiresAt: true,
        deviceId: true,
        activatedAt: true,
        createdAt: true,
      },
    });

    const withUser = await Promise.all(items.map(async (it) => {
      let user = null;
      if (it.deviceId) {
        user = await prisma.user.findUnique({
          where: { id: it.deviceId },
          select: { id: true, name: true, email: true, role: true },
        });
      }
      return { ...it, user };
    }));

    return res.json({ ok: true, licenses: withUser });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;
