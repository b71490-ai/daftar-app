import { useEffect, useState } from 'react';
import { getSession, getTrader } from '../store/auth';

export default function AdminTraders() {
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const trader = getTrader();
  const isAdmin = trader && (trader.role === 'ADMIN' || trader.id === 'a23af08a-979d-4dcb-b0bd-490ce7152eb0');

  async function downloadExport(format = 'csv') {
    try {
      setExporting(true);
      const session = getSession();
      const token = session?.traderId || trader?.id || null;
      if (!token) return alert('مطلوب تسجيل دخول مسؤول لتحميل الملف');
      if (format === 'csv') {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/traders/export.csv`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return alert('فشل تحميل الملف');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'traders_export.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        // json export using admin list endpoint
        const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/traders`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return alert('فشل تحميل الملف');
        const body = await res.json();
        const blob = new Blob([JSON.stringify(body.traders || [], null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'traders_export.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      alert('حدث خطأ أثناء التحميل');
    } finally {
      setExporting(false);
    }
  }

  const fetchTraders = async () => {
    setLoading(true);
    try {
      const session = getSession();
      const token = session?.traderId || trader?.id || null;
      if (!token) return;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/traders`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return setTraders([]);
      const body = await res.json();
      setTraders(Array.isArray(body.traders) ? body.traders : []);
    } catch (e) { setTraders([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (isAdmin) fetchTraders(); }, [isAdmin]);

  if (!isAdmin) return <div style={{ padding: 16 }}>غير مسموح - خاص بمسؤولي النظام</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>قائمة الحسابات — الإدارة</h2>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <select value={exportFormat} onChange={e => setExportFormat(e.target.value)} style={{ padding: 6, marginRight: 8 }}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <button disabled={exporting} onClick={() => downloadExport(exportFormat)} style={{ marginLeft: 8, padding: '6px 10px', background: '#0b73c2', color: '#fff', border: 'none', borderRadius: 6, cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.7 : 1 }}>
            {exporting ? 'جارٍ التحضير…' : 'تحميل'}
          </button>
        </div>
      </div>
      {loading ? <div>جاري التحميل…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #eee', padding: 8 }}>ID</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>البريد</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>مؤكَّد؟</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>تاريخ إرسال رابط التأكيد</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>تاريخ التأكيد</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>تاريخ إرسال رسالة الترحيب</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>محاولات إعادة الإرسال (24h)</th>
              </tr>
            </thead>
            <tbody>
              {traders.map(t => (
                <tr key={t.id}>
                  <td style={{ border: '1px solid #eee', padding: 8, fontFamily: 'monospace' }}>{t.id}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{t.email || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{t.emailVerified ? 'نعم' : 'لا'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{t.lastConfirmationSentAt || t.pendingLastConfirmationSentAt || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{t.emailVerifiedAt || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{t.welcomeEmailSent || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{Array.isArray(t.resendAttempts) ? t.resendAttempts.length : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
