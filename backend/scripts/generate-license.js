require('dotenv/config');
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require('child_process');

function base64urlFromBuffer(buf) {
    return Buffer.from(buf)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }
  
  function signRSASignatureB64(privateKeyPem, payloadB64) {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(payloadB64, "utf8");   // نوقع "payloadB64" نفسه (مش JSON الخام)
    signer.end();
    const sigBuf = signer.sign(privateKeyPem); // يرجع Buffer
    return base64urlFromBuffer(sigBuf);        // نحوله base64url يدويًا
  }
// الاستخدام:
// node scripts/generate-license.js --days 30 --device "" 
// اختياري: --customer "Ammar" --plan "pro"
(async () => {
  const args = process.argv.slice(2);
  const get = (k, def = "") => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : def;
  };

  const days = parseInt(get("--days", "30"), 10);
  const customer = get("--customer", "");
  const plan = get("--plan", "basic");
  const deviceId = get("--device", "");

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // بيانات الترخيص (بدون التوقيع)
  const payloadObj = {
    v: 1,
    customer: customer || null,
    plan,
    expiresAt: expiresAt.toISOString(),
    deviceId: deviceId || null,
    nonce: crypto.randomBytes(10).toString("hex"),
  };

  const payload = base64url(JSON.stringify(payloadObj));

  const privateKeyPath = path.join(__dirname, "..", "keys", "private.pem");
  const privateKeyPem = fs.readFileSync(privateKeyPath, "utf8");

  const sig = base64url(signRSA(privateKeyPem, payload));

  // شكل السيريال: L1.<payload>.<signature>
  const licenseKey = `L1.${payload}.${sig}`;

  // خزّنه في SQLite مباشرة (Fallback بدون استخدام Prisma client)
  try {
    const id = crypto.randomUUID();
    const dbPath = require('../config').DB_PATH;
    const keyEsc = licenseKey.replace(/'/g, "''");
    const deviceEsc = deviceId ? `'${deviceId.replace(/'/g, "''")}'` : 'NULL';
    const expiresIso = expiresAt.toISOString();
    const sql = `INSERT INTO License(id, key, expiresAt, deviceId, status, activatedAt) VALUES('${id}','${keyEsc}','${expiresIso}',${deviceEsc},'active',NULL);`;
    execSync(`sqlite3 "${dbPath}" "${sql}"`);

    console.log("\n✅ License created:");
    console.log(licenseKey);
    console.log("\nExpires:", expiresAt.toISOString());
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
