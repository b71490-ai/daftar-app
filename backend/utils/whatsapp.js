const fs = require('fs');
const path = require('path');
const { ADMIN_WHATSAPP } = require('../config');

// Attempts to use Twilio if available; otherwise append to a local outbox file.
let twilioClient = null;
try {
  const Twilio = require('twilio');
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (e) {
  twilioClient = null;
}

const OUTBOX = path.join(__dirname, '..', 'whatsapp_outbox.log');

function appendActivity(entry) {
  try {
    const p = path.join(__dirname, '..', 'activity.log');
    const out = Object.assign({ time: new Date().toISOString(), channel: 'whatsapp' }, entry || {});
    fs.appendFileSync(p, JSON.stringify(out) + '\n');
  } catch (e) { /* ignore */ }
}

async function sendWhatsApp({ to, message }) {
  try {
    const recipient = to || process.env.ADMIN_WHATSAPP || ADMIN_WHATSAPP;
    if (!recipient) return { ok: false, error: 'NO_RECIPIENT' };

    // short immediate message; ensure brevity
    const short = String(message || '').slice(0, 300);

    if (twilioClient) {
      // attempt Twilio WhatsApp send if configured
      const from = process.env.TWILIO_WHATSAPP_FROM || (process.env.TWILIO_FROM && `whatsapp:${process.env.TWILIO_FROM}`) || null;
      const toAddr = `whatsapp:${recipient}`;
      if (!from) return { ok: false, error: 'NO_TWILIO_FROM' };
      const msg = await twilioClient.messages.create({ body: short, from, to: toAddr });
      try { appendActivity({ to: recipient, message: short, provider: 'twilio', id: msg.sid }); } catch (e) { }
      return { ok: true, id: msg.sid };
    }

    // fallback: write to local outbox for admin inspection (dev mode)
    const entry = { time: new Date().toISOString(), to: recipient, message: short };
    try { fs.appendFileSync(OUTBOX, JSON.stringify(entry) + '\n'); } catch (e) { /* ignore */ }
    try { appendActivity({ to: recipient, message: short, outbox: OUTBOX }); } catch (e) { }
    return { ok: true, outbox: OUTBOX };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

module.exports = { sendWhatsApp };
