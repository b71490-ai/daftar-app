const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { ADMIN_EMAIL, ALERT_FROM } = require('../config');

function appendActivity(entry) {
  try {
    const p = path.join(__dirname, '..', 'activity.log');
    const out = Object.assign({ time: new Date().toISOString(), channel: 'email' }, entry || {});
    fs.appendFileSync(p, JSON.stringify(out) + '\n');
  } catch (e) { /* ignore */ }
}

async function createTransport() {
  // If SMTP env provided, use it; otherwise create Ethereal test account
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // fallback to Ethereal for development/testing
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

function formatRemaining(expiresAt) {
  try {
    if (!expiresAt) return '-';
    const now = new Date();
    const exp = new Date(expiresAt);
    const diff = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
    return diff <= 0 ? 'منتهي' : `${diff} يوم${diff === 1 ? '' : ''}`;
  } catch (e) { return '-'; }
}

function stripHtmlTags(s) {
  if (!s) return '';
  // simple tag stripper and entity fixes
  let out = String(s).replace(/<br\s*\/?\s*>/gi, '\n');
  out = out.replace(/<\/p>/gi, '\n\n');
  out = out.replace(/<[^>]+>/g, '');
  out = out.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
  return out.trim();
}

async function sendAlert({ to, subject, license, customerName, customerId, status, expiresAt, time, eventType, extra, html, text }) {
  try {
    const transport = await createTransport();
    const from = ALERT_FROM || process.env.ALERT_FROM || `no-reply@${process.env.APP_HOST || 'daftar.local'}`;
    const recipients = to || ADMIN_EMAIL || process.env.ALERT_TO || process.env.ADMIN_EMAIL || '';
    const remaining = formatRemaining(expiresAt);

    // if caller provided text use it; otherwise build from html or structured fields
    let finalText = text;
    if (!finalText) {
      if (html) finalText = stripHtmlTags(html);
      else finalText = `الحدث: ${eventType || '-'}\nالعميل: ${customerName || '-'}\nرقم العميل: ${customerId || '-'}\nالسيريال: ${license || '-'}\nالحالة: ${status || '-'}\nالمتبقي: ${remaining}\nالوقت: ${time || new Date().toISOString()}\n\n${extra || ''}`;
    }

    const mailOptions = {
      from,
      to: recipients,
      subject: subject || `تنبيه: ${eventType}`,
      text: finalText,
    };
    if (html) mailOptions.html = html;

    const info = await transport.sendMail(mailOptions);

    // for Ethereal, return preview URL
    let preview = null;
    try { if (nodemailer.getTestMessageUrl && info) preview = nodemailer.getTestMessageUrl(info); } catch (e) { preview = null; }
    // log activity
    try {
      appendActivity({ to: recipients, subject: subject || `تنبيه: ${eventType}`, license: license || null, eventType: eventType || null, preview });
    } catch (e) { }
    if (preview) return { ok: true, preview };
    return { ok: true };
  } catch (e) {
    try { appendActivity({ to: (process.env.ALERT_TO || ADMIN_EMAIL || ''), subject: subject || null, license: license || null, eventType: eventType || null, error: String(e) }); } catch (er) { }
    return { ok: false, error: String(e) };
  }
}

module.exports = { sendAlert };
