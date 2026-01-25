let appendActivityLog = () => {};
let appendSecurityLog = () => {};
try {
  const sh = require('./server-helpers');
  appendActivityLog = sh.appendActivityLog || appendActivityLog;
  appendSecurityLog = sh.appendSecurityLog || appendSecurityLog;
} catch (e) { }
const { sendAlert } = require('./utils/notifier');
const { shouldSendAlert, markSentAlert } = require('./alertsState');
const config = require('./config');

// in-memory sliding windows (timestamp arrays)
const errors = [];
const failedAuths = [];
const slowRequests = [];

function now() { return Date.now(); }

function pruneWindow(arr) {
  const cutoff = now() - (config.MONITOR_WINDOW_MS || 60 * 60 * 1000);
  while (arr.length && arr[0] < cutoff) arr.shift();
}

async function checkAndAlert() {
  try {
    pruneWindow(errors);
    pruneWindow(failedAuths);
    pruneWindow(slowRequests);

    const errCount = errors.length;
    const failCount = failedAuths.length;
    const slowCount = slowRequests.length;

    const adminTo = config.ADMIN_EMAIL || process.env.ALERT_TO || null;
    if (!adminTo) return;

    // errors threshold
    if (config.MONITORING_ENABLED && errCount >= (config.ERROR_ALERT_THRESHOLD || 10)) {
      const eventKey = 'monitor_errors';
      const fingerprint = `errors:${Math.floor(now()/(1000*60))}`;
      if (shouldSendAlert('monitor', eventKey, fingerprint, config.MONITOR_ALERT_COOLDOWN_HOURS || 24)) {
        await sendAlert({ to: adminTo, subject: 'تنبيه: أخطاء الخادم', license: null, customerName: null, customerId: null, status: null, expiresAt: null, time: new Date().toISOString(), eventType: 'خدمة: ارتفاع الأخطاء', extra: `عدد الأخطاء خلال آخر ${Math.round((config.MONITOR_WINDOW_MS||3600000)/60000)} دقيقة: ${errCount}` });
        markSentAlert('monitor', eventKey, fingerprint);
      }
    }

    if (config.MONITORING_ENABLED && failCount >= (config.FAILED_LOGIN_THRESHOLD || 20)) {
      const eventKey = 'monitor_failed_auth';
      const fingerprint = `failed_auth:${Math.floor(now()/(1000*60))}`;
      if (shouldSendAlert('monitor', eventKey, fingerprint, config.MONITOR_ALERT_COOLDOWN_HOURS || 24)) {
        await sendAlert({ to: adminTo, subject: 'تنبيه: محاولات دخول فاشلة', license: null, customerName: null, customerId: null, status: null, expiresAt: null, time: new Date().toISOString(), eventType: 'خدمة: محاولات دخول مريبة', extra: `محاولات فاشلة خلال آخر ${Math.round((config.MONITOR_WINDOW_MS||3600000)/60000)} دقيقة: ${failCount}` });
        markSentAlert('monitor', eventKey, fingerprint);
      }
    }

    // slow requests are informational; alert only if many
    if (config.MONITORING_ENABLED && slowCount >= 50) {
      const eventKey = 'monitor_slow';
      const fingerprint = `slow:${Math.floor(now()/(1000*60))}`;
      if (shouldSendAlert('monitor', eventKey, fingerprint, config.MONITOR_ALERT_COOLDOWN_HOURS || 24)) {
        await sendAlert({ to: adminTo, subject: 'تنبيه: طلبات بطيئة', license: null, customerName: null, customerId: null, status: null, expiresAt: null, time: new Date().toISOString(), eventType: 'خدمة: طلبات بطيئة', extra: `طلبات بطيئة خلال آخر ${Math.round((config.MONITOR_WINDOW_MS||3600000)/60000)} دقيقة: ${slowCount}` });
        markSentAlert('monitor', eventKey, fingerprint);
      }
    }
  } catch (e) { /* don't throw */ }
}

// periodic checker every 5 minutes
setInterval(() => { if (config.MONITORING_ENABLED) checkAndAlert().catch(()=>{}); }, 5 * 60 * 1000);

function recordError() {
  errors.push(now());
  pruneWindow(errors);
}

function recordFailedAuth() {
  failedAuths.push(now());
  pruneWindow(failedAuths);
}

function recordSlowRequest(durationMs) {
  slowRequests.push(now());
  pruneWindow(slowRequests);
}

function getMetrics() {
  pruneWindow(errors);
  pruneWindow(failedAuths);
  pruneWindow(slowRequests);
  return {
    errors: errors.length,
    failedAuths: failedAuths.length,
    slowRequests: slowRequests.length,
    windowMs: config.MONITOR_WINDOW_MS || 3600000,
    slowRequestMs: config.SLOW_REQUEST_MS || 800
  };
}

module.exports = { recordError, recordFailedAuth, recordSlowRequest, getMetrics, checkAndAlert };
