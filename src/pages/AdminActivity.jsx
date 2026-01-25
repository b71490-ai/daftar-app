import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSession, getTrader } from '../store/auth';

export default function AdminActivity() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const trader = getTrader();

  const isAdmin = trader && (trader.role === 'ADMIN' || trader.id === 'a23af08a-979d-4dcb-b0bd-490ce7152eb0');

  const fetchEntries = async (overrideQ, overrideAction) => {
    setLoading(true);
    setError(null);
    try {
      const session = getSession();
      const token = session?.traderId || trader?.id || null;
      if (!token) { navigate('/'); return; }
      const params = new URLSearchParams();
      const qParam = (typeof overrideQ !== 'undefined') ? overrideQ : q;
      const actionParam = (typeof overrideAction !== 'undefined') ? overrideAction : action;
      if (qParam && String(qParam).trim() !== '') params.set('q', qParam.trim());
      if (actionParam && String(actionParam).trim() !== '') params.set('action', actionParam.trim());

      const url = `${import.meta.env.VITE_API_URL}/admin/activity${params.toString() ? ('?' + params.toString()) : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) { navigate('/'); return; }
      if (!res.ok) { const b = await res.json().catch(()=>({})); setError(b?.error || 'خطأ في جلب السجل'); setLoading(false); return; }
      const body = await res.json();
      setEntries(Array.isArray(body.entries) ? body.entries : []);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      setError(null);
      setEntries([]);
      return;
    }
    fetchEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initialize from URL params on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || window.location.search || '');
      const q0 = params.get('q') || '';
      const a0 = params.get('action') || '';
      if (q0) setQ(q0);
      if (a0) setAction(a0);
      fetchEntries(q0, a0);
    } catch (e) { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = () => fetchEntries();

  if (!isAdmin) {
    return (
      <div style={{ padding: 16 }}>
        <button className="btn" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>رجوع</button>
        <h2>سجل النشاط — الإدارة</h2>
        <div style={{ marginTop: 12, padding: 16, borderRadius: 8, background: '#fff6f6', color: '#6b2a2a' }}>
          ❌ غير متاح — الوصول مقتصر على مسؤولي النظام.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <button className="btn" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>رجوع</button>
      <h2>سجل النشاط — الإدارة</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input placeholder="بحث بالسيريال أو اسم العميل" value={q} onChange={(e)=>setQ(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, width: 320 }} />
        <select value={action} onChange={(e)=>setAction(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6 }}>
          <option value="">كل العمليات</option>
          <option value="تفعيل ناجح">تفعيل ناجح</option>
          <option value="محاولة إعادة استخدام">محاولة إعادة استخدام</option>
          <option value="جهاز غير مطابق">جهاز غير مطابق</option>
          <option value="منتهي الصلاحية">منتهي الصلاحية</option>
          <option value="إيقاف يدوي">إيقاف يدوي (Admin)</option>
          <option value="إعادة تعيين">إعادة تعيين (Admin)</option>
        </select>
        <button className="btn" onClick={onSearch} style={{ padding: '6px 10px' }}>بحث</button>
        <button className="btn" onClick={() => { setQ(''); setAction(''); fetchEntries(); }} style={{ padding: '6px 10px' }}>مسح</button>
      </div>

      {loading ? <div>جاري التحميل…</div> : error ? <div style={{ color: 'red' }}>{error}</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ddd', padding: 8 }}>الوقت</th>
                <th style={{ border: '1px solid #ddd', padding: 8 }}>نوع العملية</th>
                <th style={{ border: '1px solid #ddd', padding: 8 }}>السيريال</th>
                <th style={{ border: '1px solid #ddd', padding: 8 }}>رقم العميل</th>
                <th style={{ border: '1px solid #ddd', padding: 8 }}>اسم العميل</th>
                <th style={{ border: '1px solid #ddd', padding: 8 }}>الجهاز</th>
                <th style={{ border: '1px solid #ddd', padding: 8 }}>تفاصيل</th>
                <th style={{ border: '1px solid #ddd', padding: 8 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 12 }}>لا توجد سجلات</td></tr>
              ) : entries.map((e, idx) => (
                <tr key={idx} style={{ background: e.action && String(e.action).includes('محاولة') ? '#fff4cc' : 'transparent' }}>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{e.time || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{e.action || e.type || '-' }{e.subtype ? ` — ${e.subtype}`: ''}</td>
                  <td style={{ border: '1px solid #eee', padding: 8, fontFamily: 'monospace' }}>{e.license || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{e.customerId || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{e.customerName || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{e.deviceId || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{e.detail || e.reason || e.attemptedDeviceId || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{e.ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
