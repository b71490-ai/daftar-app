const fs = require('fs');
const path = require('path');
const traders = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'traders.json'), 'utf8') || '[]');
const headers = [
  'ID', 'البريد', 'الاسم', 'مؤكَّد', 'تاريخ إرسال رابط التأكيد', 'تاريخ التأكيد', 'تاريخ إرسال رسالة الترحيب', 'صلاحية حتى', 'أنشئ في', 'آخر تحديث', 'محاولات إعادة الإرسال (24h)'
];
function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}
const rows = traders.map(t => {
  const attempts = Array.isArray(t.resendAttempts) ? t.resendAttempts.length : 0;
  return [t.id||'', t.email||'', t.name||'', t.emailVerified? 'نعم':'لا', t.lastConfirmationSentAt || t.pendingLastConfirmationSentAt || '', t.emailVerifiedAt || '', t.welcomeEmailSent || '', t.expiresAt || '', t.createdAt || '', t.updatedAt || '', attempts];
});
const BOM = '\uFEFF';
const csv = BOM + headers.map(h => '"'+h+'"').join(',') + '\n' + rows.map(r => r.map(escapeCell).join(',')).join('\n');
const out = path.join(__dirname, '..', 'tmp_traders_export.csv');
fs.writeFileSync(out, csv, 'utf8');
console.log('Wrote', out);
console.log(require('child_process').execSync('tail -n 8 '+out).toString());
