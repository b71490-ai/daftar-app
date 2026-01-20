require('dotenv/config');
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { execSync } = require('child_process');

// Lightweight fallback using the sqlite3 CLI to avoid Prisma runtime issues during dev.
function getLicenseRowByKey(key) {
  const esc = String(key).replace(/'/g, "''");
  const sql = `SELECT id, key, expiresAt, deviceId, status, createdAt, activatedAt FROM License WHERE key='${esc}' LIMIT 1;`;
  try {
    const out = execSync(`sqlite3 -json ./dev.db "${sql.replace(/"/g, '\\"')}"`, { cwd: __dirname, stdio: ['pipe', 'pipe', 'ignore'] });
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
  execSync(`sqlite3 ./dev.db "${sql.replace(/"/g, '\\"')}"`, { cwd: __dirname });
}
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "100kb" }));

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
    if (!parsed) return res.status(400).json({ ok: false, error: "INVALID_FORMAT" });

    // تحقق توقيع RSA
    const validSig = verifyRSA(publicKeyPem, parsed.payload, parsed.sig);
    if (!validSig) return res.status(400).json({ ok: false, error: "INVALID_SIGNATURE" });

    const payloadObj = decodePayload(parsed.payload);

    // لازم يكون موجود في DB (عشان نقدر نلغي/نحظر)
    const row = getLicenseRowByKey(licenseKey);
    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    if (String(row.status || '').toLowerCase() !== "active") return res.status(403).json({ ok: false, error: "BLOCKED" });

    const now = new Date();
    const expires = new Date(row.expiresAt);
    if (expires <= now) return res.status(403).json({ ok: false, error: "EXPIRED" });

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
    const { licenseKey, deviceId } = req.body || {};
    if (!deviceId || String(deviceId).trim().length < 4) {
      return res.status(400).json({ ok: false, error: "DEVICE_REQUIRED" });
    }

    const parsed = parseLicenseKey(licenseKey);
    if (!parsed) return res.status(400).json({ ok: false, error: "INVALID_FORMAT" });

    const validSig = verifyRSA(publicKeyPem, parsed.payload, parsed.sig);
    if (!validSig) return res.status(400).json({ ok: false, error: "INVALID_SIGNATURE" });

    const row = getLicenseRowByKey(licenseKey);
    if (!row) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    if (String(row.status || '').toLowerCase() !== "active") return res.status(403).json({ ok: false, error: "BLOCKED" });

    const now = new Date();
    const expires = new Date(row.expiresAt);
    if (expires <= now) return res.status(403).json({ ok: false, error: "EXPIRED" });

    // إذا ما هو مربوط → اربطه لأول مرة
    if (!row.deviceId) {
      updateLicenseByKey(licenseKey, { deviceId: String(deviceId), activatedAt: now.toISOString(), status: 'ACTIVE' });

      const updated = getLicenseRowByKey(licenseKey);
      return res.json({ ok: true, activated: true, expiresAt: updated.expiresAt, deviceId: updated.deviceId });
    }

    // إذا مربوط بجهاز ثاني → ارفض
    if (row.deviceId !== String(deviceId)) {
      return res.status(403).json({ ok: false, error: "DEVICE_MISMATCH" });
    }

    // نفس الجهاز → OK
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

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ API running on http://localhost:${PORT}`));
