#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

async function main() {
  const id = 'auto-test-once-' + Date.now();
  const email = `dev+${id}@example.com`;
  const payload = { id, email, name: 'OneTime Test' };
  console.log('Registering:', payload);
  try {
    const r = await fetch('http://127.0.0.1:4000/api/register-trader', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => null);
    console.log('Register response:', r.status, j || '(no json)');
  } catch (e) {
    console.error('Register request failed', e);
    process.exit(1);
  }

  // wait a moment for store to be updated
  await new Promise(r => setTimeout(r, 500));

  const storePath = path.join(__dirname, '..', 'traders.json');
  if (!fs.existsSync(storePath)) {
    console.error('traders.json not found at', storePath);
    process.exit(2);
  }
  const raw = fs.readFileSync(storePath, 'utf8');
  let list = [];
  try { list = JSON.parse(raw); } catch (e) { console.error('failed to parse traders.json', e); process.exit(3); }
  const trader = list.find(t => String(t.id) === String(id));
  if (!trader) {
    console.error('Trader record not found in traders.json');
    process.exit(4);
  }
  const token = trader.emailVerificationToken;
  if (!token) {
    console.error('No emailVerificationToken present for trader:', trader);
    process.exit(5);
  }

  const url = `http://127.0.0.1:4000/api/confirm-email?token=${encodeURIComponent(token)}`;
  console.log('Confirming with URL:', url);

  // First attempt
  try {
    const r1 = await fetch(url);
    const t1 = await r1.text();
    console.log('First confirm status:', r1.status);
    console.log('First confirm body snippet:', (t1 || '').slice(0, 200));
  } catch (e) { console.error('First confirm failed', e); }

  // Second attempt
  try {
    const r2 = await fetch(url);
    const t2 = await r2.text();
    console.log('Second confirm status:', r2.status);
    console.log('Second confirm body snippet:', (t2 || '').slice(0, 200));
  } catch (e) { console.error('Second confirm failed', e); }
}

main().catch(e => { console.error(e); process.exit(99); });
