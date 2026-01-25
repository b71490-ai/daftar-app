#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function base64urlFromBuffer(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlFromString(s) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signPayloadB64(privateKeyPem, payloadB64) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payloadB64, 'utf8');
  signer.end();
  const sig = signer.sign(privateKeyPem);
  return base64urlFromBuffer(sig);
}

// params
const COUNT = parseInt(process.argv[2] || '1000', 10);
const DAYS = parseInt(process.argv[3] || '360', 10);
const PRICE = parseFloat(process.argv[4] || '10');

const privateKeyPath = path.join(__dirname, '..', 'keys', 'private.pem');
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const dbPath = require('../config').DB_PATH;
const outPath = path.join(__dirname, '..', 'generated-licenses.txt');

const now = Date.now();
const expiresAt = new Date(now + DAYS * 24 * 60 * 60 * 1000).toISOString();

const results = [];
for (let i = 0; i < COUNT; i++) {
  const payloadObj = {
    v: 1,
    customer: null,
    plan: 'basic',
    price: PRICE,
    expiresAt,
    deviceId: null,
    nonce: crypto.randomBytes(8).toString('hex')
  };
  const payloadJson = JSON.stringify(payloadObj);
  const payloadB64 = base64urlFromString(payloadJson);
  const sigB64 = signPayloadB64(privateKeyPem, payloadB64);
  const licenseKey = `L1.${payloadB64}.${sigB64}`;

  // insert into sqlite
  const id = crypto.randomUUID();
  const keyEsc = licenseKey.replace(/'/g, "''");
  const sql = `INSERT INTO License(id, key, expiresAt, deviceId, status, activatedAt, createdAt) VALUES('${id}','${keyEsc}','${expiresAt}',NULL,'ACTIVE',NULL,datetime('now'));`;
  try {
    execSync(`sqlite3 ${dbPath} "${sql.replace(/"/g, '\\"')}"`);
    results.push(licenseKey);
  } catch (e) {
    console.error('DB insert failed for index', i, e && e.message);
  }
  if ((i+1) % 100 === 0) process.stdout.write(`Generated ${(i+1)} / ${COUNT}\n`);
}

fs.writeFileSync(outPath, results.join('\n'));
console.log('\nDone. Generated', results.length, 'licenses. Saved to', outPath);
