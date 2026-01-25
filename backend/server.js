require('dotenv/config');
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { execSync } = require('child_process');

const config = require('./config');
const DB = config.DB_PATH || path.join(__dirname, 'dev.db');
const monitor = require('./monitor');

// Lightweight fallback using the sqlite3 CLI to avoid Prisma runtime issues during dev.
function getLicenseRowByKey(key) {
  const esc = String(key).replace(/'/g, "''");
  const sql = `SELECT id, key, expiresAt, deviceId, status, createdAt, activatedAt FROM License WHERE key='${esc}' LIMIT 1;`;
  try {
    const out = execSync(`sqlite3 -json "${DB}" "${sql.replace(/"/g, '\\"')}"`, { cwd: __dirname, stdio: ['pipe', 'pipe', 'ignore'] });
    const parsed = JSON.parse(out.toString() || '[]');
    return parsed[0] || null;
  } catch (e) {
    return null;
  }
}

function updateLicenseByKey(key, data) {
  const esc = String(key).replace(/'/g, "''");
  const sets = Object.entries(data).map(([k, v]) => {
    if (v === null) return `${k}=NULL`;
    return `${k}='${String(v).replace(/'/g, "''")}'`;
  }).join(', ');
  const sql = `UPDATE License SET ${sets} WHERE key='${esc}';`;
  execSync(`sqlite3 "${DB}" "${sql.replace(/"/g, '\\"')}"`, { cwd: __dirname });
}
const app = express();
const { sendAlert } = require('./utils/notifier');
const { shouldSendAlert, markSentAlert } = require('./alertsState');
const { sendWhatsApp } = require('./utils/whatsapp');
const tradersStore = require('./tradersStore');

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// request timing middleware to record slow requests for monitoring
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    try {
      if (dur >= (config.SLOW_REQUEST_MS || 1000)) monitor.recordSlowRequest(dur);
    } catch (e) { }
  });
  next();
});

// helper: check if frontend app URL is reachable (HEAD request with timeout)
const http = require('http');
const https = require('https');
function checkUrlReachable(u, timeoutMs = 2000) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(u);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const opts = { method: 'HEAD', host: urlObj.hostname, port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80), path: urlObj.pathname || '/', timeout: timeoutMs };
      const req = lib.request(opts, (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 400;
        res.resume();
        resolve(ok);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    } catch (e) { resolve(false); }
  });
}

// mount Prisma-backed admin router (uses its own middlewares)
try {
  const adminRouter = require('./routes/adminLicenses');
  app.use(adminRouter);
} catch (e) {
  // if Prisma client isn't available in the environment, ignore mounting
}

// Rate limit للتفعيل/التحقق (يمنع التخمين)
const licenseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/license", licenseLimiter);

function base64urlToBuffer(s) {
  // base64url -> base64
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function maskLicense(key) {
  try {
    if (!key) return null;
    const k = String(key);
    if (k.length <= 12) return k.replace(/.(?=.{4})/g, '*');
    return k.slice(0, 6) + '…' + k.slice(-4);
  } catch (e) { return null; }
}

function appendSecurityLog(entry) {
  try {
    const p = path.join(__dirname, 'security.log');
    const e = Object.assign({}, entry || {});
    if (e.license) e.license = maskLicense(e.license);
    if (e.existingDeviceId) e.existingDeviceId = String(e.existingDeviceId).slice(0,12);
    if (e.attemptedDeviceId) e.attemptedDeviceId = String(e.attemptedDeviceId).slice(0,12);
    const out = Object.assign({ time: new Date().toISOString() }, e);
    fs.appendFileSync(p, JSON.stringify(out) + '\n');
  } catch (e) { /* ignore logging errors */ }
}

function appendActivityLog(entry) {
  try {
    const p = path.join(__dirname, 'activity.log');
    // mask sensitive fields before writing
    const e = Object.assign({}, entry || {});
    if (e.license) e.license = maskLicense(e.license);
    if (e.archive) e.archive = String(e.archive).replace(/\s+/g, '');
    if (e.customerId) e.customerId = String(e.customerId).slice(0, 8) + '...';
    const out = Object.assign({ time: new Date().toISOString() }, e);
    fs.appendFileSync(p, JSON.stringify(out) + '\n');
  } catch (e) { /* ignore logging errors */ }
}

function verifyRSA(publicKeyPem, data, signatureB64Url) {
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(data, "utf8");
    verifier.end();
  const sigBuf = base64urlToBuffer(signatureB64Url);
  return verifier.verify(publicKeyPem, sigBuf);
}

function parseLicenseKey(licenseKey) {
  // الشكل: L1.<payload>.<sig>
  const parts = String(licenseKey || "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== "L1") return null;
  return { payload: parts[1], sig: parts[2] };
}

function decodePayload(payloadB64Url) {
  const buf = base64urlToBuffer(payloadB64Url);
  const json = buf.toString("utf8");
  return JSON.parse(json);
}

const publicKeyPath = path.join(__dirname, "keys", "public.pem");
const publicKeyPem = fs.readFileSync(publicKeyPath, "utf8");

// 1) Verify: يتحقق هل السيريال صحيح وموجود وغير منتهي
app.post("/api/license/verify", async (req, res) => {
  try {
    const { licenseKey } = req.body || {};
    const parsed = parseLicenseKey(licenseKey);
      if (!parsed) {
        appendSecurityLog({ endpoint: '/api/license/verify', error: 'INVALID_FORMAT', license: maskLicense(licenseKey), ip: req.ip || null });
        return res.status(400).json({ ok: false, error: "INVALID_FORMAT" });
      }

    // تحقق توقيع RSA
    const validSig = verifyRSA(publicKeyPem, parsed.payload, parsed.sig);
    if (!validSig) {
      appendSecurityLog({ endpoint: '/api/license/verify', error: 'INVALID_SIGNATURE', license: maskLicense(licenseKey), ip: req.ip || null });
      return res.status(400).json({ ok: false, error: "INVALID_SIGNATURE" });
    }

    const payloadObj = decodePayload(parsed.payload);

    // لازم يكون موجود في DB (عشان نقدر نلغي/نحظر)
    const row = getLicenseRowByKey(licenseKey);
    if (!row) {
      appendSecurityLog({ endpoint: '/api/license/verify', error: 'NOT_FOUND', license: maskLicense(licenseKey), ip: req.ip || null });
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    // allow ACTIVE, USED and LOCKED statuses for verification (LOCKED = bound and cannot be reassigned)
    if (!["active", "used", "locked"].includes(String(row.status || '').toLowerCase())) {
      appendSecurityLog({ endpoint: '/api/license/verify', error: 'BLOCKED', license: maskLicense(licenseKey), currentStatus: row.status || null, ip: req.ip || null });
      return res.status(403).json({ ok: false, error: "BLOCKED" });
    }

    const now = new Date();
    const expires = new Date(row.expiresAt);
    if (expires <= now) {
      appendSecurityLog({ endpoint: '/api/license/verify', error: 'EXPIRED', license: maskLicense(licenseKey), ip: req.ip || null });
      appendActivityLog({ action: 'منتهي الصلاحية', license: String(licenseKey), deviceId: row.deviceId || null, customerId: row.deviceId || null, ip: req.ip || null });
      // send expiry notification
      try {
        const userRecord = row.deviceId ? getUserById(row.deviceId) : null;
        const adminTo = config.ADMIN_EMAIL || process.env.ALERT_TO || process.env.ADMIN_EMAIL || null;
        if (adminTo) {
          const eventKey = 'subscription_expired';
          const fingerprint = String(row.expiresAt || '');
          if (shouldSendAlert(licenseKey, eventKey, fingerprint, 24)) {
            sendAlert({
              to: adminTo,
              subject: 'تنبيه اشتراك',
              license: licenseKey,
              customerName: userRecord?.name || null,
              customerId: userRecord?.id || row.deviceId || null,
              status: row.status || null,
              expiresAt: row.expiresAt || null,
              time: new Date().toISOString(),
              eventType: 'منتهي الصلاحية',
            }).then(r => {
              if (r && r.preview) appendActivityLog({ action: 'تنبيه مرسل (email_preview)', license: String(licenseKey), detail: r.preview });
              markSentAlert(licenseKey, eventKey, fingerprint);
            }).catch(()=>{});
          }
        }
      } catch (e) { }
      return res.status(403).json({ ok: false, error: "EXPIRED" });
    }

    return res.json({
      ok: true,
      plan: payloadObj.plan || "basic",
      expiresAt: row.expiresAt,
      boundDeviceId: row.deviceId || null,
      activatedAt: row.activatedAt || null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// 2) Activate: يربط السيريال بأول جهاز يفعّل (أو يسمح لنفس الجهاز فقط)
app.post("/api/license/activate", async (req, res) => {
  try {
    const { licenseKey, deviceId, customerName } = req.body || {};
    if (!deviceId || String(deviceId).trim().length < 4) {
      appendSecurityLog({ endpoint: '/api/license/activate', error: 'DEVICE_REQUIRED', license: maskLicense(licenseKey), deviceId: deviceId || null, ip: req.ip || null });
      return res.status(400).json({ ok: false, error: "DEVICE_REQUIRED" });
    }

    const parsed = parseLicenseKey(licenseKey);
    if (!parsed) {
      appendSecurityLog({ endpoint: '/api/license/activate', error: 'INVALID_FORMAT', license: maskLicense(licenseKey), deviceId: deviceId || null, customerName: customerName || null, ip: req.ip || null });
      return res.status(400).json({ ok: false, error: "INVALID_FORMAT" });
    }

    const validSig = verifyRSA(publicKeyPem, parsed.payload, parsed.sig);
    if (!validSig) {
      appendSecurityLog({ endpoint: '/api/license/activate', error: 'INVALID_SIGNATURE', license: maskLicense(licenseKey), deviceId: deviceId || null, customerName: customerName || null, ip: req.ip || null });
      return res.status(400).json({ ok: false, error: "INVALID_SIGNATURE" });
    }

    const row = getLicenseRowByKey(licenseKey);
    if (!row) {
      appendSecurityLog({ endpoint: '/api/license/activate', error: 'NOT_FOUND', license: maskLicense(licenseKey), deviceId: deviceId || null, customerName: customerName || null, ip: req.ip || null });
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    // allow activation attempts against ACTIVE, USED or LOCKED records
    // (LOCKED means already bound; further attempts will be checked against deviceId)
    const curStatus = String(row.status || '').toLowerCase();
    if (!["active", "used", "locked"].includes(curStatus)) {
      appendSecurityLog({ endpoint: '/api/license/activate', error: 'BLOCKED', license: maskLicense(licenseKey), deviceId: deviceId || null, currentStatus: row.status || null, ip: req.ip || null });
      return res.status(403).json({ ok: false, error: "BLOCKED" });
    }

    const now = new Date();
    const expires = new Date(row.expiresAt);
    if (expires <= now) {
      appendSecurityLog({ endpoint: '/api/license/activate', error: 'EXPIRED', license: maskLicense(licenseKey), deviceId: deviceId || null, ip: req.ip || null });
      appendActivityLog({ action: 'منتهي الصلاحية', license: String(licenseKey), deviceId: deviceId || null, customerId: deviceId || null, ip: req.ip || null });
      return res.status(403).json({ ok: false, error: "EXPIRED" });
    }

    // إذا ما هو مربوط → اربطه لأول مرة
    if (!row.deviceId) {
      // ensure a User record exists for this deviceId (deviceId used as user id)
      try {
        if (deviceId) {
          const uid = String(deviceId).replace(/'/g, "''");
          const nameEsc = String(customerName || '').replace(/'/g, "''");
          const exists = execSync(`sqlite3 "${DB}" "SELECT id FROM User WHERE id='${uid}' LIMIT 1;"`, { cwd: __dirname }).toString().trim();
          if (exists) {
            if (nameEsc) execSync(`sqlite3 "${DB}" "UPDATE User SET name='${nameEsc}' WHERE id='${uid}';"`, { cwd: __dirname });
          } else {
            // insert new user with role USER
            execSync(`sqlite3 "${DB}" "INSERT INTO User (id,name,role,createdAt) VALUES ('${uid}','${nameEsc}','USER', datetime('now'));"`, { cwd: __dirname });
          }
        }
      } catch (e) { /* ignore DB upsert errors */ }

      // mark as locked when bound to a device so it cannot be reassigned to other devices
      updateLicenseByKey(licenseKey, { deviceId: String(deviceId), activatedAt: now.toISOString(), status: 'LOCKED' });

      const updated = getLicenseRowByKey(licenseKey);
      // activity log: successful first-time activation / bind
      appendActivityLog({ action: 'تفعيل ناجح', license: String(licenseKey), customerId: String(deviceId), customerName: customerName || null, deviceId: String(deviceId), detail: 'first_bind' , ip: req.ip || null });
      return res.json({ ok: true, activated: true, expiresAt: updated.expiresAt, deviceId: updated.deviceId });
    }

    // إذا مربوط بجهاز ثاني → سجل المحاولة و ارفض
    if (row.deviceId && row.deviceId !== String(deviceId)) {
      try {
        const logEntry = {
          time: new Date().toISOString(),
          licenseKey: maskLicense(String(licenseKey)),
          existingDeviceId: row.deviceId ? String(row.deviceId).slice(0,12) : null,
          attemptedDeviceId: String(deviceId).slice(0,12),
          customerName: customerName || null,
          ip: req.ip || (req.connection && req.connection.remoteAddress) || null
        };
        const logPath = path.join(__dirname, 'activation_reuse.log');
        fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
      } catch (e) { /* ignore logging errors */ }

      // also log to main security log
      appendSecurityLog({ endpoint: '/api/license/activate', error: 'DEVICE_MISMATCH', license: maskLicense(licenseKey), existingDeviceId: row.deviceId || null, attemptedDeviceId: String(deviceId), customerName: customerName || null, ip: req.ip || null });
      // activity log: failed activation attempt due to device mismatch
      appendActivityLog({ action: 'محاولة إعادة استخدام', subtype: 'جهاز غير مطابق', license: String(licenseKey), customerId: row.deviceId || null, customerName: null, deviceId: String(deviceId), attemptedDeviceId: String(deviceId), ip: req.ip || null });

      // send email alert to admins about reuse attempt
      try {
        const userRecord = row.deviceId ? getUserById(row.deviceId) : null;
        const adminTo = config.ADMIN_EMAIL || process.env.ALERT_TO || process.env.ADMIN_EMAIL || null;
        if (adminTo) {
            const eventKey = 'reuse_attempt';
            const fingerprint = `${String(row.deviceId||'')}:${String(deviceId||'')}`;
            if (shouldSendAlert(licenseKey, eventKey, fingerprint, 24)) {
              sendAlert({
                to: adminTo,
                subject: 'تحذير أمني',
                license: licenseKey,
                customerName: userRecord?.name || null,
                customerId: userRecord?.id || row.deviceId || null,
                status: row.status || null,
                expiresAt: row.expiresAt || null,
                time: new Date().toISOString(),
                eventType: 'محاولة إعادة استخدام',
                extra: `Existing device: ${row.deviceId} — Attempted device: ${deviceId}`
              }).then(r => {
                if (r && r.preview) appendActivityLog({ action: 'تنبيه مرسل (email_preview)', license: String(licenseKey), detail: r.preview });
                markSentAlert(licenseKey, eventKey, fingerprint);
              }).catch(()=>{});

              // send short WhatsApp admin-only alert (immediate, short)
              try {
                const shortMsg = `تحذير أمني: محاولة إعادة استخدام سيريال ${maskLicense(licenseKey)} — جهاز: ${String(deviceId).slice(0,16)}`;
                sendWhatsApp({ message: shortMsg }).then(() => { /* fire-and-forget */ }).catch(()=>{});
                // also mark whatsapp send in state so it doesn't repeat
                markSentAlert(licenseKey, `${eventKey}::whatsapp`, fingerprint);
              } catch (e) { }
            }
          }
      } catch (e) { /* ignore notification errors */ }

      return res.status(403).json({ ok: false, error: "DEVICE_MISMATCH" });
    }

    // نفس الجهاز → OK
    // ensure status is marked as LOCKED (in case it was ACTIVE/USED)
    try {
      if (String(row.status || '').toLowerCase() !== 'locked') {
        updateLicenseByKey(licenseKey, { status: 'LOCKED', activatedAt: now.toISOString() });
      }
    } catch (e) { /* ignore */ }

    return res.json({
      ok: true,
      activated: true,
      expiresAt: row.expiresAt,
      deviceId: row.deviceId,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
});

// Endpoint: receive trial alert requests from clients and notify admin / user email
app.post('/api/trial-alert', async (req, res) => {
  try {
    const { traderId, name, email, days } = req.body || {};
    if (!traderId || !days) return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });

    const eventKey = `trial_alert_${days}d`;
    const fingerprint = `${traderId}::${days}`;
    try {
      if (!shouldSendAlert(traderId, eventKey, fingerprint, 24)) {
        // already sent recently
        appendActivityLog({ action: 'trial_alert_skipped', traderId, traderName: name || null, days });
        return res.json({ ok: true, skipped: true });
      }
    } catch (e) { /* ignore state errors */ }

    // Prepare payload
    const payload = {
      to: null, // will be decided by sendAlert
      subject: `تنبيه: انتهاء التجربة بعد ${days} يوم${days === 1 ? '' : ''}`,
      license: null,
      customerName: name || null,
      customerId: traderId,
      status: 'trial',
      expiresAt: null,
      time: new Date().toISOString(),
      eventType: `trial_expiry_${days}d`,
      extra: `حساب تجريبي سينتهي بعد ${days} يوم`,
    };

    // send to admin first (sendAlert uses ADMIN_EMAIL fallback)
    try {
      const r = await sendAlert(Object.assign({}, payload, { to: process.env.ADMIN_EMAIL || null }));
      appendActivityLog({ action: 'trial_alert_sent_admin', traderId, traderName: name || null, days, result: r.ok ? 'ok' : r.error || 'failed' });
    } catch (e) {
      appendActivityLog({ action: 'trial_alert_failed_admin', traderId, traderName: name || null, days, error: String(e) });
    }

    // optionally send to trader email if provided — only after email is confirmed
    if (email) {
      try {
        const traderRecord = traderId ? tradersStore.getTraderById(traderId) : null;
        const allowUserSend = traderRecord ? !!traderRecord.emailVerified : false;
        if (!allowUserSend) {
          appendActivityLog({ action: 'trial_alert_skipped_unverified', traderId, traderName: name || null, email, days });
        } else {
          const r2 = await sendAlert(Object.assign({}, payload, { to: email, subject: `انتباه: تبقّى ${days} يوم من الفترة التجريبية` }));
          appendActivityLog({ action: 'trial_alert_sent_user', traderId, traderName: name || null, email, days, result: r2.ok ? 'ok' : r2.error || 'failed' });
        }
      } catch (e) {
        appendActivityLog({ action: 'trial_alert_failed_user', traderId, traderName: name || null, email, days, error: String(e) });
      }
    }

    try { markSentAlert(traderId, eventKey, fingerprint); } catch (e) { /* ignore */ }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Register or update trader record on server (called from frontend register/activation)
app.post('/api/register-trader', async (req, res) => {
  try {
    const t = req.body || {};
    if (!t.id) return res.status(400).json({ ok: false, error: 'MISSING_ID' });
    const email = String(t.email || '').trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return res.status(400).json({ ok: false, error: 'MISSING_EMAIL', message: 'يرجى إدخال بريد إلكتروني صحيح' });
    if (!emailPattern.test(email)) return res.status(400).json({ ok: false, error: 'INVALID_EMAIL', message: 'يرجى إدخال بريد إلكتروني صحيح' });

    // enforce uniqueness across traders (case-insensitive), allow updating same trader
    try {
      const existing = tradersStore.loadTraders().find(x => x.email && String(x.email).toLowerCase() === email.toLowerCase());
      if (existing && String(existing.id) !== String(t.id)) {
        return res.status(409).json({ ok: false, error: 'EMAIL_TAKEN', message: 'هذا البريد مسجّل مسبقًا' });
      }
    } catch (e) { /* ignore store read errors */ }

    const up = {
      id: t.id,
      name: t.name || null,
      phone: t.phone || null,
      password: t.password || null,
      email: email,
      plan: t.plan || 'trial',
      emailVerified: false,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      trialStartedAt: t.trialStartedAt || t.expiresAt ? t.trialStartedAt || null : null,
      expiresAt: t.expiresAt || null,
      createdAt: t.createdAt || new Date().toISOString(),
    };
    // generate verification token and send email (optional flow)
    try {
      const token = crypto.randomBytes(20).toString('hex');
      const expires = new Date(); expires.setHours(expires.getHours() + 24); // 24h validity
      up.emailVerificationToken = token;
      up.emailVerificationExpiresAt = expires.toISOString();
      up.emailVerified = false;
      tradersStore.upsertTrader(up);

      // send confirmation email with link (uses sendAlert)
      const confirmUrlBase = process.env.APP_URL || `http://127.0.0.1:${process.env.PORT||4000}`;
      const link = `${confirmUrlBase.replace(/\/$/, '')}/api/confirm-email?token=${encodeURIComponent(token)}`;
      const subject = 'مرحبًا بك! يرجى تأكيد بريدك الإلكتروني';
      const html = `<!doctype html>
<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; color: #111; line-height:1.4;">
  <p>مرحبًا ${up.name ? up.name : ''},</p>
  <p>تم إنشاء حساب جديد لدينا. نحتاج لتأكيد بريدك الإلكتروني لتفعيل الحساب وحماية وصولك.</p>
  <p style="margin:18px 0"><a href="${link}" style="display:inline-block;padding:10px 16px;background:#0b73c2;color:#fff;border-radius:6px;text-decoration:none;">تأكيد البريد الإلكتروني</a></p>
  <p style="color:#666;font-size:13px;">إن لم تطلب هذا، يمكنك تجاهل هذه الرسالة.</p>
</div>`;
      try {
        // record send timestamp and persist, then fire-and-forget send email asynchronously
        try { up.lastConfirmationSentAt = new Date().toISOString(); tradersStore.upsertTrader(up); } catch (e) { }
        sendAlert({ to: email, subject, html }).then(() => {
          appendActivityLog({ action: 'email_confirmation_sent', traderId: up.id, email });
        }).catch((err) => {
          appendActivityLog({ action: 'email_confirmation_send_failed', traderId: up.id, email, error: String(err) });
        });
      } catch (e) { appendActivityLog({ action: 'email_confirmation_send_failed', traderId: up.id, email, error: String(e) }); }
    } catch (e) {
      tradersStore.upsertTrader(up);
    }
    appendActivityLog({ action: 'register_trader', traderId: up.id, email: up.email, name: up.name || null });
    return res.json({ ok: true, trader: up });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Login by email + password
app.post('/api/login', async (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    if (!email || !password) return res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });

    const list = tradersStore.loadTraders();
    const trader = list.find(t => t.email && String(t.email).toLowerCase() === email);
    if (!trader) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'لا يوجد حساب بهذا البريد' });

    if (String(trader.password || '') !== String(password)) {
      appendActivityLog({ action: 'login_failed', traderId: trader.id, email: trader.email });
      return res.status(403).json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'البريد أو كلمة المرور غير صحيحة' });
    }

    // successful login
    appendActivityLog({ action: 'login', traderId: trader.id, email: trader.email });
    return res.json({ ok: true, trader });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Admin login: authenticate against SQLite User table by email+password and return legacy id token
app.post('/api/admin-login', (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().replace(/'/g, "''");
    const password = String((req.body && req.body.password) || '');
    if (!email || !password) return res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });

    // ensure password column exists (no-op if already present)
    try { execSync(`sqlite3 "${DB}" "ALTER TABLE User ADD COLUMN password TEXT;"`, { cwd: __dirname, stdio: ['pipe','ignore','ignore'] }); } catch (e) { }

    const sql = `SELECT id,name,email,role,password FROM User WHERE lower(email)=lower('${email}') LIMIT 1;`;
    const out = execSync(`sqlite3 -json "${DB}" "${sql.replace(/"/g, '\\"')}"`, { cwd: __dirname });
    const rows = JSON.parse(out.toString() || '[]');
    const user = rows[0] || null;
    if (!user) return res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'لا يوجد مستخدم بهذا البريد' });
    if (String(user.role || '').toUpperCase() !== 'ADMIN') return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'ليس مستخدم إدارة' });
    if (String(user.password || '') !== String(password)) {
      appendActivityLog({ action: 'admin_login_failed', userId: user.id, email: user.email });
      return res.status(403).json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'البريد أو كلمة المرور غير صحيحة' });
    }

    appendActivityLog({ action: 'admin_login', userId: user.id, email: user.email });
    // Return legacy id token and user info for convenience
    return res.json({ ok: true, id: user.id, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Confirm email token endpoint
app.get('/api/confirm-email', async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).send('Invalid token');
    const list = tradersStore.loadTraders();
    const trader = list.find(t => (t.emailVerificationToken === token) || (t.pendingEmailVerificationToken === token));
    if (!trader) return res.status(404).send('الرابط غير صالح أو منتهي');

    // determine which token matched
    const isPrimary = trader.emailVerificationToken === token;
    const isPending = trader.pendingEmailVerificationToken === token;
    const now = new Date();
    if (isPrimary) {
      if (trader.emailVerificationExpiresAt && new Date(trader.emailVerificationExpiresAt) < now) return res.status(410).send('الرابط منتهي الصلاحية');
      trader.emailVerified = true;
      // clear any tokens to enforce single-use
      trader.emailVerificationToken = null;
      trader.emailVerificationExpiresAt = null;
      trader.pendingEmailVerificationToken = null;
      trader.pendingEmailVerificationExpiresAt = null;
      trader.emailVerifiedAt = now.toISOString();
      tradersStore.upsertTrader(trader);
      appendActivityLog({ action: 'email_confirmed', traderId: trader.id, email: trader.email });
      // send a friendly welcome message after successful confirmation
      try {
        // do not resend welcome email if already sent
        if (trader.welcomeEmailSent) {
          appendActivityLog({ action: 'welcome_email_skipped_already_sent', traderId: trader.id, email: trader.email });
        } else {
          const support = process.env.SUPPORT_EMAIL || config.SUPPORT_EMAIL || config.ADMIN_EMAIL || 'support@example.com';
          const appBase = (process.env.APP_URL||`http://127.0.0.1:${process.env.FRONTEND_PORT||5176}`).replace(/\/$/, '');
          const trialRemaining = (() => {
            try {
              if (trader && trader.expiresAt) {
                const now = new Date();
                const exp = new Date(trader.expiresAt);
                const diff = Math.max(0, Math.ceil((exp - now) / (24 * 60 * 60 * 1000)));
                const unit = diff === 1 ? 'يوم' : (diff === 2 ? 'يومان' : 'أيام');
                return `${diff} ${unit}`;
              }
            } catch (e) { }
            return 'غير محددة';
          })();
          const welcomeHtml = `<!doctype html><div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; color:#111; padding:20px;"><h2>مرحبًا ${trader.name || ''}،</h2><p>تم تفعيل حسابك بنجاح. جميع الميزات متاحة الآن.</p><p>الفترة التجريبية المتبقية: <strong>${trialRemaining}</strong>.</p><p>بياناتك محفوظة بأمان. يمكنك البدء فورًا.</p><p style="margin-top:16px"><a href="${appBase}/dashboard" style="display:inline-block;padding:10px 14px;background:#0b73c2;color:#fff;border-radius:6px;text-decoration:none;">الدخول إلى النظام</a></p><p style="font-size:13px;color:#666;margin-top:12px;">للمساعدة: <a href="mailto:${support}">${support}</a></p></div>`;
          sendAlert({ to: trader.email, subject: 'مرحبًا بك! حسابك أصبح جاهزًا', html: welcomeHtml }).then(() => {
            const ts = new Date().toISOString();
            try { tradersStore.upsertTrader({ id: trader.id, welcomeEmailSent: ts }); } catch (e) { }
            appendActivityLog({ action: 'welcome_email_sent', traderId: trader.id, email: trader.email });
          }).catch((err) => {
            appendActivityLog({ action: 'welcome_email_failed', traderId: trader.id, email: trader.email, error: String(err) });
          });
        }
      } catch (e) { appendActivityLog({ action: 'welcome_email_failed', traderId: trader.id, email: trader.email, error: String(e) }); }
      {
        const appUrl = (process.env.APP_URL || `http://127.0.0.1:${process.env.FRONTEND_PORT||5176}`).replace(/\/$/, '');
        const ok = await checkUrlReachable(appUrl, 1500);
        if (ok) return res.redirect(appUrl + '/dashboard');
        return res.send(`<!doctype html><div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; color:#111; padding:24px;"><h2>تم تأكيد بريدك الإلكتروني</h2><p>حسابك مُفعل، يمكنك الآن الدخول إلى النظام.</p><p style="margin-top:16px"><a href="${appUrl}/dashboard" style="display:inline-block;padding:10px 14px;background:#0b73c2;color:#fff;border-radius:6px;text-decoration:none;">الدخول إلى النظام</a></p><p style="font-size:13px;color:#666;margin-top:12px;">للمساعدة: <a href="mailto:${process.env.SUPPORT_EMAIL || config.SUPPORT_EMAIL || config.ADMIN_EMAIL || 'support@example.com'}">${process.env.SUPPORT_EMAIL || config.SUPPORT_EMAIL || config.ADMIN_EMAIL || 'support@example.com'}</a></p></div>`);
      }
    }
    if (isPending) {
      if (trader.pendingEmailVerificationExpiresAt && new Date(trader.pendingEmailVerificationExpiresAt) < now) return res.status(410).send('الرابط منتهي الصلاحية');
      // swap pending into primary email
      const oldEmail = trader.email || null;
      trader.email = trader.pendingEmail;
      trader.emailVerified = true;
      trader.emailVerifiedAt = now.toISOString();
      // clear pending
      // clear tokens to enforce single-use
      trader.pendingEmail = null;
      trader.pendingEmailVerificationToken = null;
      trader.pendingEmailVerificationExpiresAt = null;
      trader.emailVerificationToken = null;
      trader.emailVerificationExpiresAt = null;
      trader.updatedAt = now.toISOString();
      tradersStore.upsertTrader(trader);
      appendActivityLog({ action: 'email_changed_confirmed', traderId: trader.id, oldEmail, newEmail: trader.email });
      // send welcome to the new verified email
        try {
        // do not resend welcome email if already sent
        if (trader.welcomeEmailSent) {
          appendActivityLog({ action: 'welcome_email_skipped_already_sent', traderId: trader.id, email: trader.email });
        } else {
          const support2 = process.env.SUPPORT_EMAIL || config.SUPPORT_EMAIL || config.ADMIN_EMAIL || 'support@example.com';
          const appBase2 = (process.env.APP_URL||`http://127.0.0.1:${process.env.FRONTEND_PORT||5176}`).replace(/\/$/, '');
          const trialRemaining2 = (() => {
            try {
              if (trader && trader.expiresAt) {
                const now = new Date();
                const exp = new Date(trader.expiresAt);
                const diff = Math.max(0, Math.ceil((exp - now) / (24 * 60 * 60 * 1000)));
                const unit = diff === 1 ? 'يوم' : (diff === 2 ? 'يومان' : 'أيام');
                return `${diff} ${unit}`;
              }
            } catch (e) { }
            return 'غير محددة';
          })();
          const welcomeHtml2 = `<!doctype html><div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; color:#111; padding:20px;"><h2>مرحبًا ${trader.name || ''}،</h2><p>تم ربط البريد الجديد بالحساب بنجاح. جميع الميزات متاحة الآن.</p><p>الفترة التجريبية المتبقية: <strong>${trialRemaining2}</strong>.</p><p>بياناتك محفوظة بأمان. يمكنك البدء فورًا.</p><p style="margin-top:16px"><a href="${appBase2}/dashboard" style="display:inline-block;padding:10px 14px;background:#0b73c2;color:#fff;border-radius:6px;text-decoration:none;">الدخول إلى النظام</a></p><p style="font-size:13px;color:#666;margin-top:12px;">للمساعدة: <a href="mailto:${support2}">${support2}</a></p></div>`;
          sendAlert({ to: trader.email, subject: 'مرحبًا بك! حسابك أصبح جاهزًا', html: welcomeHtml2 }).then(() => {
            const ts2 = new Date().toISOString();
            try { tradersStore.upsertTrader({ id: trader.id, welcomeEmailSent: ts2 }); } catch (e) { }
            appendActivityLog({ action: 'welcome_email_sent', traderId: trader.id, email: trader.email });
          }).catch((err) => {
            appendActivityLog({ action: 'welcome_email_failed', traderId: trader.id, email: trader.email, error: String(err) });
          });
        }
      } catch (e) { appendActivityLog({ action: 'welcome_email_failed', traderId: trader.id, email: trader.email, error: String(e) }); }
      {
        const appUrl = (process.env.APP_URL || `http://127.0.0.1:${process.env.FRONTEND_PORT||5176}`).replace(/\/$/, '');
        const ok = await checkUrlReachable(appUrl, 1500);
        if (ok) return res.redirect(appUrl + '/dashboard');
        return res.send(`<!doctype html><div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; color:#111; padding:24px;"><h2>تم تأكيد بريدك الإلكتروني</h2><p>البريد محدث، يمكنك الآن الدخول إلى النظام.</p><p style="margin-top:16px"><a href="${appUrl}/dashboard" style="display:inline-block;padding:10px 14px;background:#0b73c2;color:#fff;border-radius:6px;text-decoration:none;">الدخول إلى النظام</a></p></div>`);
      }
    }
    return res.status(400).send('Invalid token');
  } catch (e) {
    return res.status(500).send('Server error');
  }
});

// Resend confirmation link (by traderId or email)
app.post('/api/resend-confirmation', async (req, res) => {
  try {
    const { traderId, email } = req.body || {};
    const list = tradersStore.loadTraders();
    const trader = traderId ? list.find(t => String(t.id) === String(traderId)) : (email ? list.find(t => t.email && String(t.email).toLowerCase() === String(email).toLowerCase()) : null);
    if (!trader) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (trader.emailVerified) return res.status(400).json({ ok: false, error: 'ALREADY_VERIFIED', message: 'البريد الإلكتروني مؤكد بالفعل' });

    // Anti-spam: track resend attempts per trader
    const MAX_PER_DAY = Number(process.env.RESEND_MAX_PER_DAY || 3);
    const COOLDOWN_MIN = Number(process.env.RESEND_COOLDOWN_MIN || 15); // minutes
    const now = new Date();
    trader.resendAttempts = Array.isArray(trader.resendAttempts) ? trader.resendAttempts.filter(ts => {
      try { return new Date(ts) > new Date(now.getTime() - 24 * 60 * 60 * 1000); } catch { return false; }
    }) : [];
    const lastAttempt = trader.resendAttempts.length ? new Date(trader.resendAttempts[trader.resendAttempts.length - 1]) : null;
    if (trader.resendAttempts.length >= MAX_PER_DAY) {
      appendActivityLog({ action: 'resend_confirmation_rate_limited', traderId: trader.id, attempts: trader.resendAttempts.length });
      return res.status(429).json({ ok: false, error: 'RESEND_LIMIT', message: `تم الوصول للحد الأقصى لإعادة الإرسال (${MAX_PER_DAY}) خلال 24 ساعة` });
    }
    if (lastAttempt) {
      const minsSince = Math.round((now - lastAttempt) / 60000);
      if (minsSince < COOLDOWN_MIN) {
        const wait = COOLDOWN_MIN - minsSince;
        return res.status(429).json({ ok: false, error: 'RESEND_COOLDOWN', message: `الرجاء الانتظار ${wait} دقيقة قبل إعادة المحاولة`, retryAfterMinutes: wait });
      }
    }

    // OK to produce new token and send
    const isPending = !!trader.pendingEmail;
    const targetEmail = isPending ? trader.pendingEmail : trader.email;
    if (!targetEmail) return res.status(400).json({ ok: false, error: 'NO_EMAIL', message: 'لا يوجد بريد لإرسال التأكيد' });

    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(); expires.setHours(expires.getHours() + 24);
    if (isPending) {
      trader.pendingEmailVerificationToken = token;
      trader.pendingEmailVerificationExpiresAt = expires.toISOString();
    } else {
      trader.emailVerificationToken = token;
      trader.emailVerificationExpiresAt = expires.toISOString();
    }
    // record this attempt and sent timestamp
    const sentAt = now.toISOString();
    trader.resendAttempts.push(sentAt);
    if (isPending) trader.pendingLastConfirmationSentAt = sentAt; else trader.lastConfirmationSentAt = sentAt;
    trader.updatedAt = new Date().toISOString();
    tradersStore.upsertTrader(trader);

    const confirmUrlBase = process.env.APP_URL || `http://127.0.0.1:${process.env.PORT||4000}`;
    const link = `${confirmUrlBase.replace(/\/$/, '')}/api/confirm-email?token=${encodeURIComponent(token)}`;
    const name = trader.name || '';
    const html = `<!doctype html>\n<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; color: #111; line-height:1.4;">\n  <p>مرحبًا ${name},</p>\n  <p>هذا رابط تأكيد البريد الإلكتروني. اضغط الزر أدناه لإكمال التأكيد (صالِح لمدة 24 ساعة).</p>\n  <p style="margin:18px 0"><a href="${link}" style="display:inline-block;padding:10px 16px;background:#0b73c2;color:#fff;border-radius:6px;text-decoration:none;">تأكيد البريد الإلكتروني</a></p>\n  <p style="color:#666;font-size:13px;">إن لم تطلب هذا، يمكنك تجاهل هذه الرسالة.</p>\n</div>`;
    // fire-and-forget send; respond immediately with remaining attempts
      sendAlert({ to: targetEmail, subject: 'مرحبًا بك! يرجى تأكيد بريدك الإلكتروني', html }).then(() => {
      appendActivityLog({ action: 'resend_confirmation_sent', traderId: trader.id, to: targetEmail });
    }).catch((err) => {
      appendActivityLog({ action: 'resend_confirmation_failed', traderId: trader.id, to: targetEmail, error: String(err) });
    });
    const remaining = Math.max(0, MAX_PER_DAY - trader.resendAttempts.length);
    return res.json({ ok: true, remaining });
  } catch (e) { return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); }
});

// Request password reset: send email with token
app.post('/api/request-password-reset', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: 'MISSING_EMAIL', message: 'يرجى إدخال بريد إلكتروني صحيح' });
    const list = tradersStore.loadTraders();
    const trader = list.find(t => t.email && String(t.email).toLowerCase() === email);
    if (!trader) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    // Do not allow password reset if email not confirmed
    if (!trader.emailVerified) return res.status(403).json({ ok: false, error: 'EMAIL_NOT_CONFIRMED', message: 'لا يمكن استعادة كلمة المرور قبل تأكيد البريد الإلكتروني' });

    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(); expires.setHours(expires.getHours() + 2); // 2h
    trader.resetPasswordToken = token;
    trader.resetPasswordExpiresAt = expires.toISOString();
    trader.updatedAt = new Date().toISOString();
    tradersStore.upsertTrader(trader);

    const confirmUrlBase = process.env.APP_URL || `http://127.0.0.1:${process.env.PORT||4000}`;
    const link = `${confirmUrlBase.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    // send reset email asynchronously and return immediately
    sendAlert({ to: trader.email, subject: 'إعادة تعيين كلمة المرور', html: `<p>لاستعادة كلمة المرور، اضغط الرابط التالي:</p><p><a href="${link}">إعادة تعيين كلمة المرور</a></p>` }).then(() => {
      appendActivityLog({ action: 'password_reset_requested', traderId: trader.id, email: trader.email });
    }).catch((err) => {
      appendActivityLog({ action: 'password_reset_send_failed', traderId: trader.id, email: trader.email, error: String(err) });
    });

    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); }
});

// Perform password reset
app.post('/api/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.password || '');
    if (!token || !newPassword) return res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });
    const list = tradersStore.loadTraders();
    const trader = list.find(t => t.resetPasswordToken === token);
    if (!trader) return res.status(404).json({ ok: false, error: 'INVALID_TOKEN' });
    if (trader.resetPasswordExpiresAt && new Date(trader.resetPasswordExpiresAt) < new Date()) return res.status(410).json({ ok: false, error: 'TOKEN_EXPIRED' });

    trader.password = newPassword;
    trader.resetPasswordToken = null;
    trader.resetPasswordExpiresAt = null;
    trader.updatedAt = new Date().toISOString();
    tradersStore.upsertTrader(trader);
    appendActivityLog({ action: 'password_reset_completed', traderId: trader.id, email: trader.email });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); }
});

// Admin: list traders
app.get('/admin/traders', requireAuth, requireAdmin, (req, res) => {
  try {
    const list = tradersStore.loadTraders();
    return res.json({ ok: true, traders: list });
  } catch (e) { return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); }
});

// Admin: export traders as CSV (includes welcomeEmailSent)
app.get('/admin/traders/export.csv', requireAuth, requireAdmin, (req, res) => {
  try {
    const list = tradersStore.loadTraders();
    const headers = [
      'ID', 'البريد', 'الاسم', 'مؤكَّد', 'تاريخ إرسال رابط التأكيد', 'تاريخ التأكيد', 'تاريخ إرسال رسالة الترحيب', 'صلاحية حتى', 'أنشئ في', 'آخر تحديث', 'محاولات إعادة الإرسال (24h)'
    ];
    const rows = list.map(t => {
      const attempts = Array.isArray(t.resendAttempts) ? t.resendAttempts.length : 0;
      return [
        t.id || '',
        t.email || '',
        t.emailVerified ? 'نعم' : 'لا',
        t.lastConfirmationSentAt || t.pendingLastConfirmationSentAt || '',
        t.emailVerifiedAt || '',
        t.welcomeEmailSent || '',
        t.expiresAt || '',
        t.createdAt || '',
        t.updatedAt || '',
        attempts
      ];
    });
    // build CSV with BOM for Excel/Arabic compatibility
    const BOM = '\uFEFF';
    const escapeCell = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = BOM + headers.map(h => '"' + h + '"').join(',') + '\n' + rows.map(r => r.map(escapeCell).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="traders_export.csv"');
    return res.send(csv);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Admin: extend trader trial by days
app.post('/admin/traders/:id/extend', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const days = Number(req.body.days || 0);
    if (!id || !days) return res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });
    const updated = tradersStore.extendTrader(id, days);
    if (!updated) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    appendActivityLog({ action: 'admin_extend_trial', admin: req.user.id || null, traderId: id, days, newExpiresAt: updated.expiresAt });
    return res.json({ ok: true, trader: updated });
  } catch (e) { return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); }
});

// Admin: revert a trader to a fresh trial
app.post('/admin/traders/:id/revert', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const days = Number(req.body.days || 10);
    if (!id) return res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });
    const updated = tradersStore.revertToTrial(id, days);
    if (!updated) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    appendActivityLog({ action: 'admin_revert_trial', admin: req.user.id || null, traderId: id, days, newExpiresAt: updated.expiresAt });
    return res.json({ ok: true, trader: updated });
  } catch (e) { return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); }
});

// Admin: initiate change of trader email (do not allow deletion)
app.post('/admin/traders/:id/change-email', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const newEmail = String(req.body.email || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'MISSING_PARAMS' });
    if (!newEmail) return res.status(400).json({ ok: false, error: 'EMAIL_REQUIRED', message: 'لا يمكن حذف البريد الإلكتروني' });
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(newEmail)) return res.status(400).json({ ok: false, error: 'INVALID_EMAIL', message: 'يرجى إدخال بريد إلكتروني صحيح' });

    // uniqueness check
    const existing = tradersStore.loadTraders().find(x => x.email && String(x.email).toLowerCase() === newEmail.toLowerCase());
    if (existing && String(existing.id) !== String(id)) {
      return res.status(409).json({ ok: false, error: 'EMAIL_TAKEN', message: 'هذا البريد مسجّل مسبقًا' });
    }

    const trader = tradersStore.getTraderById(id);
    if (!trader) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    // create pending email change token
    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(); expires.setHours(expires.getHours() + 24);
      trader.pendingEmail = newEmail;
      trader.pendingEmailVerificationToken = token;
      trader.pendingEmailVerificationExpiresAt = expires.toISOString();
      trader.pendingLastConfirmationSentAt = new Date().toISOString();
      trader.updatedAt = new Date().toISOString();
      tradersStore.upsertTrader(trader);

    // send confirmation to new email
    const confirmUrlBase = process.env.APP_URL || `http://127.0.0.1:${process.env.PORT||4000}`;
    const link = `${confirmUrlBase.replace(/\/$/, '')}/api/confirm-email?token=${encodeURIComponent(token)}`;
    try {
      const html2 = `<!doctype html>
<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; color: #111; line-height:1.4;">
  <p>مرحبًا ${trader.name ? trader.name : ''},</p>
  <p>طلبت إدارة النظام تغيير بريدك الإلكتروني. لتأكيد البريد الجديد اضغط الزر أدناه.</p>
  <p style="margin:18px 0"><a href="${link}" style="display:inline-block;padding:10px 16px;background:#0b73c2;color:#fff;border-radius:6px;text-decoration:none;">تأكيد البريد الإلكتروني</a></p>
  <p style="color:#666;font-size:13px;">إن لم تطلب هذا، تواصل مع الدعم أو تجاهل الرسالة.</p>
</div>`;
      // send confirmation to new email asynchronously
      sendAlert({ to: newEmail, subject: 'مرحبًا بك! يرجى تأكيد بريدك الإلكتروني', html: html2 }).then(() => {
        appendActivityLog({ action: 'admin_initiate_email_change', admin: req.user?.id || null, traderId: id, pendingEmail: newEmail });
      }).catch((err) => {
        appendActivityLog({ action: 'admin_initiate_email_change_failed', admin: req.user?.id || null, traderId: id, pendingEmail: newEmail, error: String(err) });
      });
    } catch (e) {
      appendActivityLog({ action: 'admin_initiate_email_change_failed', admin: req.user?.id || null, traderId: id, pendingEmail: newEmail, error: String(e) });
    }

    return res.json({ ok: true, message: 'تم إرسال رابط تأكيد إلى البريد الجديد' });
  } catch (e) { return res.status(500).json({ ok: false, error: 'SERVER_ERROR' }); }
});
app.get("/", (req, res) => {
  res.send("Daftar API is running ✅");
});

app.get("/health", (req, res) => res.json({ ok: true }));

// Admin endpoint: list licenses with optional user info
// Require header `x-admin-id` with a User.id that has role ADMIN
// simple auth helper: check Authorization: Bearer <userId> and verify role
function getUserById(userId) {
  if (!userId) return null;
  try {
    const row = execSync(`sqlite3 "${DB}" "SELECT id,name,email,role FROM User WHERE id='${String(userId).replace(/'/g, "''")}' LIMIT 1;"`, { cwd: __dirname }).toString().trim();
    if (!row) return null;
    const parts = row.split('|');
    return { id: parts[0] || null, name: parts[1] || null, email: parts[2] || null, role: (parts[3] || '').toUpperCase() };
  } catch (e) { return null; }
}

// requireAuth middleware: supports Bearer JWT or cookie-based JWT.
// Also preserves legacy behaviour where Authorization: Bearer <userId> was used
function requireAuth(req, res, next) {
  const h = String(req.get('authorization') || '');
  let token = null;
  if (h.startsWith('Bearer ')) token = h.slice('Bearer '.length).trim();
  // fallback to cookie token name 'token'
  if (!token && req.cookies && req.cookies.token) token = req.cookies.token;

  if (!token) {
    try { monitor.recordFailedAuth(); } catch (e) { }
    return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
  }

  // legacy: token is just a userId (no dots)
  if (!token.includes('.')) {
    const user = getUserById(token);
    if (!user) {
      try { monitor.recordFailedAuth(); } catch (e) { }
      appendSecurityLog({ endpoint: 'auth', error: 'UNAUTHENTICATED_LEGACY', tokenMask: String(token).slice(0,8), ip: req.ip || null });
      return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    }
    req.user = user;
    return next();
  }

  // token looks like JWT
  const secret = process.env.JWT_SECRET || 'dev-secret';
  try {
    const payload = jwt.verify(token, secret);
    // payload should contain id/email/role
    req.user = payload;
    return next();
  } catch (e) {
    try { monitor.recordFailedAuth(); } catch (er) { }
    appendSecurityLog({ endpoint: 'auth', error: 'INVALID_TOKEN', tokenMask: String(token).slice(0,8), ip: req.ip || null });
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }
}

// requireAdmin middleware: ensure authenticated user has ADMIN role
function requireAdmin(req, res, next) {
  if (!req.user) {
    appendSecurityLog({ endpoint: 'requireAdmin', error: 'UNAUTHENTICATED', ip: req.ip || null });
    return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
  }

  // Prefer role check
  if (String((req.user.role || '')).toUpperCase() === 'ADMIN') return next();

  // log forbidden admin attempt
  appendSecurityLog({ endpoint: 'requireAdmin', error: 'FORBIDDEN_ADMIN_ONLY', user: { id: req.user.id || null, email: req.user.email || null }, ip: req.ip || null });

  // Optional fallback: allow specific admin email via env (uncomment if needed)
  // if (req.user.email === process.env.ADMIN_EMAIL) return next();

  return res.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
}

// export for reuse (CommonJS)
exports.requireAdmin = requireAdmin;

const cache = require('./cache');
const { CACHE_TTL_LICENSES, CACHE_TTL_BACKUPS, CACHE_TTL_ACTIVITY } = require('./config');

app.get('/admin/licenses', requireAuth, requireAdmin, (req, res) => {
  try {
    // Check cache first
    const cached = cache.get('admin:licenses');
    if (cached) {
      res.set('Cache-Control', `private, max-age=${Math.round(CACHE_TTL_LICENSES/1000)}`);
      return res.json(cached);
    }

    // fetch licenses with LEFT JOIN to avoid N+1 queries
    const out = execSync(`sqlite3 -json "${DB}" "SELECT License.key as key, License.status as status, License.expiresAt as expiresAt, License.deviceId as deviceId, User.id as user_id, User.name as user_name, User.email as user_email FROM License LEFT JOIN User ON License.deviceId = User.id ORDER BY License.createdAt DESC;"`, { cwd: __dirname });
    const rows = JSON.parse(out.toString() || '[]');
    // read activation_reuse.log and aggregate attempts by licenseKey
    const reuseLogPath = path.join(__dirname, 'activation_reuse.log');
    let reuseMap = {};
    try {
      if (fs.existsSync(reuseLogPath)) {
        const raw = fs.readFileSync(reuseLogPath, 'utf8').split('\n').filter(Boolean);
        raw.forEach(line => {
          try {
            const obj = JSON.parse(line);
            const k = String(obj.licenseKey || '');
            if (!k) return;
            if (!reuseMap[k]) reuseMap[k] = { count: 0, last: null };
            reuseMap[k].count += 1;
            reuseMap[k].last = obj.time || reuseMap[k].last;
          } catch (e) { /* ignore invalid lines */ }
        });
      }
    } catch (e) { /* ignore log read errors */ }

    const result = rows.map(r => {
      const linkedUser = r.user_id ? { id: r.user_id, name: r.user_name || null, email: r.user_email || null } : null;
      const reuse = reuseMap[r.key] || { count: 0, last: null };
      return { key: r.key, status: r.status, expiresAt: r.expiresAt, deviceId: r.deviceId || null, user: linkedUser, reuseAttempts: reuse.count, reuseLast: reuse.last };
    });

    const payload = { ok: true, licenses: result };
    cache.set('admin:licenses', payload, CACHE_TTL_LICENSES);
    res.set('Cache-Control', `private, max-age=${Math.round(CACHE_TTL_LICENSES/1000)}`);
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Admin: list backups with metadata
app.get('/admin/backups', requireAuth, requireAdmin, (req, res) => {
  try {
    // caching backups listing
    const cached = cache.get('admin:backups');
    if (cached) {
      res.set('Cache-Control', `private, max-age=${Math.round(CACHE_TTL_BACKUPS/1000)}`);
      return res.json(cached);
    }
    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) return res.json({ ok: true, backups: [] });
    const files = fs.readdirSync(backupsDir).filter(f => f.startsWith('backup_'));
    // read activity.log to find backup entries
    const actPath = path.join(__dirname, 'activity.log');
    let actLines = [];
    try { if (fs.existsSync(actPath)) actLines = fs.readFileSync(actPath, 'utf8').split('\n').filter(Boolean); } catch (e) { actLines = []; }
    const backupActs = {};
    actLines.forEach(l => { try { const o = JSON.parse(l); if (o && o.action === 'backup' && o.archive) backupActs[o.archive] = o; } catch (e) {} });

    const out = files.map(name => {
      const p = path.join(backupsDir, name);
      let stat = null;
      try { stat = fs.statSync(p); } catch (e) { }
      const act = backupActs[name] || null;
      return {
        name,
        path: `backups/${name}`,
        mtime: stat ? stat.mtime.toISOString() : null,
        size: stat ? stat.size : null,
        status: act ? (act.result || 'success') : 'unknown',
        s3: act ? (act.s3 || null) : null,
        recordedAt: act ? act.time : null
      };
    }).sort((a,b) => (b.mtime||'') - (a.mtime||''));

    const payload = { ok: true, backups: out };
    cache.set('admin:backups', payload, CACHE_TTL_BACKUPS);
    res.set('Cache-Control', `private, max-age=${Math.round(CACHE_TTL_BACKUPS/1000)}`);
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Admin: activity log viewer
app.get('/admin/activity', requireAuth, requireAdmin, (req, res) => {
  try {
    // cache activity briefly to reduce disk reads under load
    const cacheKey = 'admin:activity:' + String(req.query.q || '') + ':' + String(req.query.action || '');
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set('Cache-Control', `private, max-age=${Math.round(CACHE_TTL_ACTIVITY/1000)}`);
      return res.json(cached);
    }
    const logPath = path.join(__dirname, 'activity.log');
    if (!fs.existsSync(logPath)) return res.json({ ok: true, entries: [] });

    const raw = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const entries = raw.map(l => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);

    // support simple query params: q (search across license/customerName), action
    const q = String(req.query.q || '').trim().toLowerCase();
    const action = req.query.action ? String(req.query.action).trim() : null;

    let out = entries.slice();
    if (q) {
      out = out.filter(e => {
        if (!e) return false;
        const lic = String(e.license || '').toLowerCase();
        const name = String(e.customerName || '').toLowerCase();
        return lic.includes(q) || name.includes(q) || String(e.customerId || '').toLowerCase().includes(q);
      });
    }
    if (action) {
      out = out.filter(e => String(e.action || '').toLowerCase().includes(String(action).toLowerCase()) || String(e.subtype || '').toLowerCase().includes(String(action).toLowerCase()));
    }

    // newest first by time
    out.sort((a, b) => {
      try { return new Date(b.time).getTime() - new Date(a.time).getTime(); } catch { return 0; }
    });

    const payload = { ok: true, entries: out };
    cache.set(cacheKey, payload, CACHE_TTL_ACTIVITY);
    res.set('Cache-Control', `private, max-age=${Math.round(CACHE_TTL_ACTIVITY/1000)}`);
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Admin: block a license
app.post('/admin/licenses/:key/block', requireAuth, requireAdmin, (req, res) => {
  try {
    const key = req.params.key;
    const row = getLicenseRowByKey(key);
    if (!row) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    updateLicenseByKey(key, { status: 'BLOCKED' });
    // activity log: admin blocked license
    try {
      const adminId = req.user?.id || null;
      const userRecord = row.deviceId ? getUserById(row.deviceId) : null;
      appendActivityLog({ action: 'إيقاف يدوي (Admin)', license: String(key), adminId, customerId: row.deviceId || null, customerName: userRecord?.name || null, deviceId: row.deviceId || null, ip: req.ip || null });
    } catch (e) { /* ignore */ }

    // send confirmation email about manual block
    try {
      const adminTo = config.ADMIN_EMAIL || process.env.ALERT_TO || process.env.ADMIN_EMAIL || null;
      if (adminTo) {
          const userRecord = row.deviceId ? getUserById(row.deviceId) : null;
          const eventKey = 'admin_block';
          const fingerprint = `BLOCKED:${String(req.user?.id||'')}`;
          if (shouldSendAlert(key, eventKey, fingerprint, 24)) {
            sendAlert({
              to: adminTo,
              subject: 'تحذير أمني',
              license: key,
              customerName: userRecord?.name || null,
              customerId: userRecord?.id || row.deviceId || null,
              status: 'BLOCKED',
              time: new Date().toISOString(),
              eventType: 'إيقاف يدوي (Admin)'
            }).then(()=>{ markSentAlert(key, eventKey, fingerprint); }).catch(()=>{});
          }
        }
    } catch (e) { }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Admin: unblock a license (set to ACTIVE)
app.post('/admin/licenses/:key/unblock', requireAuth, requireAdmin, (req, res) => {
  try {
    const key = req.params.key;
    const row = getLicenseRowByKey(key);
    if (!row) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    // If license is bound to a device, restore to USED, otherwise set to ACTIVE
    const now = new Date().toISOString();
    const newStatus = row.deviceId ? 'USED' : 'ACTIVE';
    const updates = { status: newStatus };
    if (row.deviceId && !row.activatedAt) updates.activatedAt = now;


    // activity log: admin unblock
    try {
      const adminId = req.user?.id || null;
      const userRecord = row.deviceId ? getUserById(row.deviceId) : null;
      appendActivityLog({ action: 'فك القفل (Admin)', license: String(key), adminId, customerId: row.deviceId || null, customerName: userRecord?.name || null, deviceId: row.deviceId || null, newStatus, ip: req.ip || null });
    } catch (e) { /* ignore */ }
    updateLicenseByKey(key, updates);
    // send confirmation email about unblocking
    try {
      const adminTo = config.ADMIN_EMAIL || process.env.ALERT_TO || process.env.ADMIN_EMAIL || null;
      if (adminTo) {
          const userRecord = row.deviceId ? getUserById(row.deviceId) : null;
          const eventKey = 'admin_unblock';
          const fingerprint = `${newStatus}:${String(req.user?.id||'')}`;
          if (shouldSendAlert(key, eventKey, fingerprint, 24)) {
            sendAlert({
              to: adminTo,
              subject: 'تحذير أمني',
              license: key,
              customerName: userRecord?.name || null,
              customerId: userRecord?.id || row.deviceId || null,
              status: newStatus,
              time: new Date().toISOString(),
              eventType: 'فك القفل (Admin)'
            }).then(()=>{ markSentAlert(key, eventKey, fingerprint); }).catch(()=>{});
          }
        }
    } catch (e) { }
    return res.json({ ok: true, status: newStatus });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Admin: reset a license (clear device binding, activatedAt, set to ACTIVE)
app.post('/admin/licenses/:key/reset', requireAuth, requireAdmin, (req, res) => {
  try {
    const key = req.params.key;
    const row = getLicenseRowByKey(key);
    if (!row) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const updates = { deviceId: null, activatedAt: null, status: 'ACTIVE' };

    // activity log: admin reset
    try {
      const adminId = req.user?.id || null;
      const userRecord = row.deviceId ? getUserById(row.deviceId) : null;
      appendActivityLog({ action: 'إعادة تعيين (Admin)', license: String(key), adminId, customerId: row.deviceId || null, customerName: userRecord?.name || null, deviceId: row.deviceId || null, ip: req.ip || null });
    } catch (e) { /* ignore */ }
    updateLicenseByKey(key, updates);
    // send confirmation email about reset (throttled daily unless state changed)
    try {
      const adminTo = config.ADMIN_EMAIL || process.env.ALERT_TO || process.env.ADMIN_EMAIL || null;
      if (adminTo) {
        const userRecord = row.deviceId ? getUserById(row.deviceId) : null;
        const eventKey = 'admin_reset';
        const fingerprint = `${String(row.deviceId||'')}:${String(req.user?.id||'')}`;
        if (shouldSendAlert(key, eventKey, fingerprint, 24)) {
          sendAlert({
            to: adminTo,
            subject: 'تحذير أمني',
            license: key,
            customerName: userRecord?.name || null,
            customerId: userRecord?.id || row.deviceId || null,
            status: 'ACTIVE',
            time: new Date().toISOString(),
            eventType: 'إعادة تعيين (Admin)'
          }).then(()=>{ markSentAlert(key, eventKey, fingerprint); }).catch(()=>{});
        }
      }
    } catch (e) { }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
});

// Central error handler: log internal errors (masked) and return a generic message to clients
app.use((err, req, res, next) => {
  try { monitor.recordError(err); } catch (e) { }
  try {
    // Log internally with stack (masked)
    appendSecurityLog({ endpoint: req.path || 'unknown', error: err && err.message ? err.message : 'INTERNAL_ERROR', stack: (err && err.stack) ? String(err.stack).split('\n').slice(0,3).join(' | ') : null });
    appendActivityLog({ action: 'internal_error', detail: err && err.message ? String(err.message) : 'INTERNAL_ERROR', path: req.path || null });
  } catch (e) { /* ignore logging errors */ }
  // Always send a generic error to the client
  try {
    res.status(500).json({ ok: false, error: 'SERVER_ERROR', message: 'حدث خطأ داخلي. يرجى المحاولة لاحقًا.' });
  } catch (e) { /* ignore */ }
});

// start email scheduler (automatic subscription alerts)
try {
  if (config.ENABLE_SCHEDULERS) {
    const { startScheduler } = require('./emailScheduler');
    // run daily; also scan immediately on startup
    startScheduler({ intervalMs: 24 * 60 * 60 * 1000, runOnStart: true });
    console.log('🔔 Email scheduler started (subscription alerts)');
  } else {
    console.log('🔕 Email scheduler disabled by configuration (NODE_ENV=' + config.NODE_ENV + ')');
  }
} catch (e) {
  console.error('Failed to start email scheduler', e && e.stack ? e.stack : e);
}

// start backup scheduler (daily at midnight)
try {
  if (config.ENABLE_BACKUPS) {
    const { startBackupScheduler } = require('./backupScheduler');
    startBackupScheduler();
  } else {
    console.log('🔕 Backup scheduler disabled by configuration (NODE_ENV=' + config.NODE_ENV + ')');
  }
} catch (e) {
  console.error('Failed to start backup scheduler', e && e.stack ? e.stack : e);
}
