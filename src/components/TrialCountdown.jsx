import { useEffect, useState } from 'react';
import { getTrader } from '../store/auth';

export default function TrialCountdown() {
  const [days, setDays] = useState(null);
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    const calc = () => {
      try {
        const t = getTrader();
        if (!t) return setDays(null);
        if (String(t.role || '').toUpperCase() === 'ADMIN') return setDays('admin');
        if (!t.expiresAt || t.plan !== 'trial') return setDays(null);
        const now = new Date();
        const exp = new Date(t.expiresAt);
        const diff = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
        if (diff <= 0) return setDays(0);
        setDays(diff);
      } catch (e) { setDays(null); }
    };

    calc();
    const iv = setInterval(calc, 60 * 60 * 1000); // refresh hourly
    return () => clearInterval(iv);
  }, []);

  // trigger server-side/in-system alerts when days === 3 or days === 1
  useEffect(() => {
    try {
      if (days === 3 || days === 1) {
        const key = `trial_alert_${days}`;
        const sent = sessionStorage.getItem(key);
        if (sent) return;
        // call backend endpoint to notify admin / optionally email user
        const t = getTrader();
        fetch('/api/trial-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ traderId: t?.id || null, name: t?.name || null, email: t?.email || null, days }),
        }).catch(() => { /* ignore network errors */ });
        sessionStorage.setItem(key, new Date().toISOString());
        setNotified(true);
      }
    } catch (e) { }
  }, [days]);

  if (days === null) return null;
  if (days === 'admin') {
    return (
      <div style={{ margin: '8px 0', padding: '8px 12px', background: '#0b73c2', color: '#fff', borderRadius: 8, fontSize: 13, display: 'inline-block' }}>
        حساب إداري كامل
      </div>
    );
  }
  if (days <= 3) return null; // let the stronger banner handle 3..0 days

  // Simple arabic phrasing: "متبقي N أيام من الفترة التجريبية"
  const text = `متبقي ${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : 'أيام'} من الفترة التجريبية`;

  return (
    <div style={{ margin: '8px 0', padding: '8px 12px', background: '#fff9f0', color: '#6b3f00', borderRadius: 8, fontSize: 13, display: 'inline-block' }}>
      {text}
    </div>
  );
}
