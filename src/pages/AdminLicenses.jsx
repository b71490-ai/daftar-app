import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getSession, getTrader } from "../store/auth";

export default function AdminLicenses() {
  const [licenses, setLicenses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const navigate = useNavigate();
  const [copied, setCopied] = useState(null);
  const [search, setSearch] = useState('');
  const trader = getTrader();
  const [alertCount, setAlertCount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [lastSeenAlertTime, setLastSeenAlertTime] = useState(null);
  const [showNewAlertBanner, setShowNewAlertBanner] = useState(false);

  const sortLicenses = (arr) => {
    if (!Array.isArray(arr)) return arr || [];
    const now = new Date();
    const daysRemaining = (l) => {
      if (!l || !l.expiresAt) return null;
      const expires = new Date(l.expiresAt);
      return Math.ceil((expires - now) / (24 * 60 * 60 * 1000));
    };

    // severity categories (lower = higher priority):
    // 0 = strong alert (<3 days)
    // 1 = medium alert (3..6 days)
    // 2 = light alert (7..15 days)
    // 3 = active / no-alert (>15 days or active with no expiry)
    // 4 = used/other
    // 5 = expired (always last)
    const severity = (l) => {
      const s = String(l.status || '').toUpperCase();
      const rem = daysRemaining(l);
      if (rem !== null && rem <= 0) return 5; // expired
      if (rem !== null && rem < 3) return 0; // strong
      if (rem !== null && rem <= 6) return 1; // medium
      if (rem !== null && rem <= 15) return 2; // light
      if (s === 'ACTIVE') return 3;
      if (s === 'USED' || l.deviceId) return 4;
      return 3;
    };

    return arr.slice().sort((a, b) => {
      const sa = severity(a);
      const sb = severity(b);
      if (sa !== sb) return sa - sb;

      // same severity: tie-breakers
      // for alert groups prefer closer expiry first
      const ra = daysRemaining(a);
      const rb = daysRemaining(b);
      if (ra !== null && rb !== null && ra !== rb) return ra - rb;

      // otherwise fallback to createdAt desc
      try {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      } catch (e) { return 0; }
    });
  };

  useEffect(() => {
    const fetchLicenses = async () => {
      setLoading(true);
      setError(null);
      // read URL params to allow pre-filtering via /admin/licenses?filter=expiring&q=...
      try {
        const params = new URLSearchParams(window.location.search || '');
        const f = params.get('filter') || '';
        const q0 = params.get('q') || '';
        if (f) setFilter(f);
        if (q0) setSearch(q0);
      } catch (e) { /* ignore */ }

      const session = getSession();
      const trader = getTrader();
      const token = session?.traderId || trader?.id || null;
      if (!token) {
        navigate('/');
        return;
      }

      try {
        // client-side short cache to avoid redundant reloads when navigating
        try {
          const raw = sessionStorage.getItem('admin:licenses');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.time && (Date.now() - parsed.time) < 10000) { // 10s
              setLicenses(sortLicenses(parsed.data || []));
              setLoading(false);
              return;
            }
          }
        } catch (e) { /* ignore cache parse errors */ }

        const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/licenses`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 403) {
          // not authorized -> go back to dashboard
          navigate('/');
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error || 'خطأ في جلب التراخيص');
          setLoading(false);
          return;
        }

        const body = await res.json();
        const raw = Array.isArray(body) ? body : (body?.licenses || []);
        try { sessionStorage.setItem('admin:licenses', JSON.stringify({ time: Date.now(), data: raw })); } catch (e) { }
        setLicenses(sortLicenses(raw));
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchLicenses();
  // re-run when the URL query changes so shortcuts work
  }, [navigate, window.location.search]);

  // Poll admin activity for reuse attempts (admin only)
  useEffect(() => {
    if (!(trader && (trader.role === 'ADMIN' || trader.id === 'a23af08a-979d-4dcb-b0bd-490ce7152eb0'))) return;
    let mounted = true;
    const fetchAlerts = async () => {
      try {
        const session = getSession();
        const token = session?.traderId || trader?.id || null;
        if (!token) return;
        const q = encodeURIComponent('محاولة إعادة استخدام');
        const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/activity?action=${q}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const body = await res.json().catch(() => ({}));
        const entries = Array.isArray(body.entries) ? body.entries : [];
        if (!mounted) return;
        setAlerts(entries);
        if (!entries || entries.length === 0) return;
        const newest = entries[0]?.time;
        if (!newest) return;
        if (!lastSeenAlertTime) {
          // first-run: mark but don't notify
          setLastSeenAlertTime(newest);
          return;
        }
        // count entries newer than lastSeen
        const newCount = entries.filter(e => new Date(e.time) > new Date(lastSeenAlertTime)).length;
        if (newCount > 0) {
          setAlertCount(c => c + newCount);
          setShowNewAlertBanner(true);
          setTimeout(() => setShowNewAlertBanner(false), 6 * 1000);
        }
      } catch (e) { /* ignore */ }
    };

    // initial fetch
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 10 * 1000); // poll every 10s
    return () => { mounted = false; clearInterval(iv); };
  }, [trader, lastSeenAlertTime]);

  const getVisualStatus = (l) => {
    // show reuse-attempts status first if present
    if (l?.reuseAttempts && Number(l.reuseAttempts) > 0) {
      return { emoji: '🔁', label: `محاولات إعادة استخدام (${l.reuseAttempts})`, code: 6 };
    }
    const now = new Date();
    const expiresAt = l.expiresAt ? new Date(l.expiresAt) : null;

    // 1) BLOCKED
    const blocked = l.blocked || String(l.status || '').toUpperCase() === 'BLOCKED' || String(l.status || '').toUpperCase() === 'DISABLED';
    if (blocked) return { emoji: '⚫', label: 'موقوف', code: 5 };

    // 2) EXPIRED
    if (expiresAt && expiresAt < now) return { emoji: '🔴', label: 'منتهي', code: 4 };

    // 3) EXPIRING (various levels)
    if (expiresAt) {
      const diffDays = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
      if (diffDays <= 0) return { emoji: '🔴', label: 'منتهي', code: 4 };
      if (diffDays < 3) return { emoji: '🚨', label: 'قريب جداً على الانتهاء', code: 2 };
      if (diffDays <= 6) return { emoji: '⚠️', label: 'قارب على الانتهاء', code: 2 };
      if (diffDays <= 15) return { emoji: '🟡', label: 'قريب من الانتهاء', code: 2 };
    }

    // 4) USED (previously bound or explicitly marked USED)
    if (String(l.status || '').toUpperCase() === 'USED' || (l.deviceId && String(l.status || '').toUpperCase() !== 'ACTIVE')) {
      return { emoji: '🟠', label: 'مستخدم سابقًا', code: 3 };
    }

    // 5) ACTIVE
    if (String(l.status || '').toUpperCase() === 'ACTIVE') return { emoji: '🟢', label: 'نشط ومربوط', code: 1 };

    // fallback
    if (l.deviceId) return { emoji: '🟠', label: 'مربوط', code: 3 };
    return { emoji: '⚫', label: l.status || '-', code: 5 };
  };

  const filterMatches = (l) => {
    if (!filter || filter === 'all') return true;
    const s = getVisualStatus(l);
    switch (filter) {
      case 'active': return s.code === 1;
      case 'expiring': return s.code === 2;
      case 'used': return s.code === 3;
      case 'expired': return s.code === 4;
      case 'blocked': return s.code === 5;
      default: return true;
    }
  };

  const searchMatches = (l) => {
    if (!search || String(search).trim() === '') return true;
    const q = String(search).trim().toLowerCase();
    const serial = String(l.key || l.serial || l.licenseKey || '').toLowerCase();
    const uid = String(l.user?.id || '').toLowerCase();
    const uname = String(l.user?.name || '').toLowerCase();
    return serial.includes(q) || uid.includes(q) || uname.includes(q);
  };

  const rowBg = (code) => {
    switch (code) {
      case 6: return '#fff4cc'; // reuse attempts - light warning (yellow)
      case 1: return '#e8f7ea'; // active - greenish
      case 2: return '#fff9e6'; // expiring category - use neutral yellowish by default (per-row remainingColor will refine)
      case 3: return '#fff4e6'; // used - orangeish
      case 4: return '#fdecea'; // expired - light red (row)
      case 5: return '#e9e9ea'; // blocked - grey
      default: return 'transparent';
    }
  };

  const remainingColor = (remDays) => {
    if (remDays === null) return 'transparent';
    if (remDays <= 0) return '#8b0000'; // expired - dark red
    if (remDays < 3) return '#ffd6d6'; // less than 3 - strong alert (light red background)
    if (remDays <= 6) return '#fff4e6'; // 3..6 - orange-ish
    if (remDays <= 15) return '#fff9e6'; // 7..15 - yellow-ish
    return '#e8f7ea'; // >15 - green
  };

  const prettifySerial = (s) => {
    if (!s) return '';
    // keep full value for copy; prettify for display
    try {
      const parts = String(s).split('.');
      return parts.map(p => p.length > 12 ? p.slice(0,6) + '…' + p.slice(-4) : p).join(' · ');
    } catch { return s; }
  };

  const copySerial = async (s) => {
    try {
      await navigator.clipboard.writeText(String(s));
      setCopied(s);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'فشل النسخ', type: 'error' } }));
    }
  };

  const exportCSV = () => {
    if (!licenses) return;
    // export should respect current filter + search
    const rows = licenses.filter(l => filterMatches(l) && searchMatches(l)).map((l) => {
      const s = getVisualStatus(l);
      const now = new Date();
      const expiresAtDate = l.expiresAt ? new Date(l.expiresAt) : null;
      let remaining = '';
      if (expiresAtDate) {
        const diffDays = Math.ceil((expiresAtDate - now) / (24 * 60 * 60 * 1000));
        remaining = diffDays <= 0 ? 'منتهي' : diffDays;
      }
      return {
        serial: l.key || l.serial || l.licenseKey || '',
        customerId: l.user?.id || '',
        customerName: l.user?.name || '',
        status: s.label || '',
        remaining: remaining,
        expiresAt: l.expiresAt || '',
        deviceId: l.deviceId || ''
      };
    });

    // if no rows after applying filter+search, warn and abort
    if (!rows || rows.length === 0) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'لا يوجد بيانات للتصدير', type: 'error' } }));
      return;
    }

    // Arabic headers in requested order:
    const headers = ['السيريال', 'رقم العميل', 'اسم العميل', 'الحالة', 'المتبقي بالأيام', 'تاريخ الانتهاء', 'الجهاز المرتبط'];
    const esc = (v) => '"' + String(v || '').replace(/"/g, '""') + '"';
    // map rows to the same header order
    const csv = [headers.join(',')].concat(rows.map(r => [
      esc(r.serial),
      esc(r.customerId),
      esc(r.customerName),
      esc(r.status),
      esc(r.remaining),
      esc(r.expiresAt),
      esc(r.deviceId)
    ].join(','))).join('\n');

    // add UTF-8 BOM so Excel/Sheets detect UTF-8 and Arabic correctly
    const csvWithBOM = '\uFEFF' + csv;
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD
    const fname = `licenses_${today}.csv`;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const callAdmin = async (path, method = 'POST') => {
    const session = getSession();
    const trader = getTrader();
    const token = session?.traderId || trader?.id || null;
    if (!token) throw new Error('MISSING_AUTH');
    const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403) throw new Error('FORBIDDEN');
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b?.error || 'SERVER_ERROR');
    }
    return res.json().catch(() => ({}));
  };

  const blockLicense = async (key) => {
    try {
      await callAdmin(`/admin/licenses/${encodeURIComponent(key)}/block`);
      // refresh
      setLoading(true);
      setError(null);
      const session = getSession();
      const trader = getTrader();
      const token = session?.traderId || trader?.id || null;
      const r = await fetch(`${import.meta.env.VITE_API_URL}/admin/licenses`, { headers: { Authorization: `Bearer ${token}` } });
      const b = await r.json().catch(() => ({}));
      setLicenses(sortLicenses(b?.licenses || []));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: String(e), type: 'error' } }));
    } finally { setLoading(false); }
  };

  const unblockLicense = async (key) => {
    try {
      await callAdmin(`/admin/licenses/${encodeURIComponent(key)}/unblock`);
      // refresh
      setLoading(true);
      setError(null);
      const session = getSession();
      const trader = getTrader();
      const token = session?.traderId || trader?.id || null;
      const r = await fetch(`${import.meta.env.VITE_API_URL}/admin/licenses`, { headers: { Authorization: `Bearer ${token}` } });
      const b = await r.json().catch(() => ({}));
      setLicenses(sortLicenses(b?.licenses || []));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: String(e), type: 'error' } }));
    } finally { setLoading(false); }
  };

  const resetLicense = async (key) => {
    try {
      await callAdmin(`/admin/licenses/${encodeURIComponent(key)}/reset`);
      // refresh
      setLoading(true);
      setError(null);
      const session = getSession();
      const trader = getTrader();
      const token = session?.traderId || trader?.id || null;
      const r = await fetch(`${import.meta.env.VITE_API_URL}/admin/licenses`, { headers: { Authorization: `Bearer ${token}` } });
      const b = await r.json().catch(() => ({}));
      setLicenses(sortLicenses(b?.licenses || []));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: String(e), type: 'error' } }));
    } finally { setLoading(false); }
  };

  const [selected, setSelected] = useState(null);
  const openDetails = (l) => setSelected(l);
  const closeDetails = () => setSelected(null);

  // filtered list according to current search + filter (computed once for render)
  const filteredLicensesRaw = licenses ? licenses.filter(l => filterMatches(l) && searchMatches(l)) : [];

  const applyManualSort = (arr) => {
    if (!Array.isArray(arr)) return arr || [];
    const now = new Date();
    const daysRemaining = (l) => {
      if (!l || !l.expiresAt) return null;
      const expires = new Date(l.expiresAt);
      return Math.ceil((expires - now) / (24 * 60 * 60 * 1000));
    };

    const byRemaining = (a, b) => {
      const ra = daysRemaining(a);
      const rb = daysRemaining(b);
      const aExpired = ra !== null && ra <= 0;
      const bExpired = rb !== null && rb <= 0;
      if (aExpired !== bExpired) return aExpired ? 1 : -1; // expired last
      if (ra !== null && rb !== null) return ra - rb;
      if (ra !== null) return -1;
      if (rb !== null) return 1;
      return 0;
    };

    const byCustomerName = (a, b) => {
      const na = String(a.user?.name || '').toLowerCase();
      const nb = String(b.user?.name || '').toLowerCase();
      if (na === '' && nb === '') return 0;
      if (na === '') return 1;
      if (nb === '') return -1;
      return na < nb ? -1 : na > nb ? 1 : 0;
    };

    const byCustomerId = (a, b) => {
      const ia = a.user?.id || '';
      const ib = b.user?.id || '';
      if (!ia && !ib) return 0;
      if (!ia) return 1;
      if (!ib) return -1;
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    };

    const byStatus = (a, b) => {
      const pa = getVisualStatus(a).code || 0;
      const pb = getVisualStatus(b).code || 0;
      if (pa !== pb) return pa - pb;
      return 0;
    };

    const out = arr.slice();
    switch (sortBy) {
      case 'remaining':
        out.sort(byRemaining);
        break;
      case 'customerName':
        out.sort(byCustomerName);
        break;
      case 'customerId':
        out.sort(byCustomerId);
        break;
      case 'status':
        out.sort(byStatus);
        break;
      default:
        // default ordering uses existing smart sort
        return sortLicenses(out);
    }

    return out;
  };

  // If user is actively searching, keep the current order and only hide non-matching rows.
  // This preserves status/colors and avoids re-sorting while typing.
  const filteredLicenses = (search && String(search).trim() !== '') ? filteredLicensesRaw : applyManualSort(filteredLicensesRaw);

  // When the search field is cleared, revert to default ordering immediately
  useEffect(() => {
    try {
      if (!search || String(search).trim() === '') {
        // reset manual sort to default so table returns to default ordering
        setSortBy('default');
      }
    } catch (e) { /* ignore */ }
  }, [search]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button className="btn" onClick={() => { try { if (window.history && window.history.length > 1) { navigate(-1); } else { navigate('/admin'); } } catch (e) { navigate('/admin'); } }} style={{ padding: '6px 10px' }}>← رجوع</button>
        <h2 style={{ margin: 0 }}>لوحة الإدارة — السيريالات</h2>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={() => setFilter('all')} style={{ padding: '6px 10px' }}>الكل</button>
          <button className="btn" onClick={() => setFilter('active')} style={{ padding: '6px 10px' }}>🟢 نشط</button>
          <button className="btn" onClick={() => setFilter('expiring')} style={{ padding: '6px 10px' }}>🟡 قرب الانتهاء</button>
          <button className="btn" onClick={() => setFilter('used')} style={{ padding: '6px 10px' }}>🟠 مستخدم</button>
          <button className="btn" onClick={() => setFilter('expired')} style={{ padding: '6px 10px' }}>🔴 منتهي</button>
          <button className="btn" onClick={() => setFilter('blocked')} style={{ padding: '6px 10px' }}>⚫ موقوف</button>
          {(trader && (trader.role === 'ADMIN' || trader.id === 'a23af08a-979d-4dcb-b0bd-490ce7152eb0')) ? (
            <>
              <button className="btn" onClick={exportCSV} style={{ padding: '6px 10px', background: '#0b2540', color: '#fff', borderRadius: 6 }}>تصدير CSV</button>
              {/* Alerts bell (admin only) */}
              <button className="btn" title="تنبيهات محاولات إعادة الاستخدام" onClick={() => { setAlertCount(0); setLastSeenAlertTime(new Date().toISOString()); navigate('/admin/activity'); }} style={{ padding: '6px 10px', marginLeft: 8, position: 'relative' }}>
                🔔
                {alertCount > 0 ? (
                  <span style={{ position: 'absolute', top: -6, right: -6, background: '#e63946', color: '#fff', borderRadius: 12, padding: '2px 6px', fontSize: 12 }}>{alertCount}</span>
                ) : null}
              </button>
            </>
          ) : null}
        </div>
        <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: '#333' }}>ترتيب:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6 }}>
            <option value="default">افتراضي (الأقرب انتهاءً)</option>
            <option value="remaining">حسب المتبقي</option>
            <option value="customerName">حسب اسم العميل</option>
            <option value="customerId">حسب رقم العميل</option>
            <option value="status">حسب الحالة</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="بحث باسم العميل، رقم العميل، أو السيريال"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', width: 320 }}
          />
          <div style={{ fontSize: 13, color: '#666' }}>تصفية: {filter}</div>
        </div>
      </div>

      {loading ? (
        <div>جاري التحميل…</div>
      ) : error ? (
        <div style={{ color: 'red' }}>{error}</div>
      ) : (
        <>
          {showNewAlertBanner ? (
            <div style={{ marginBottom: 8, padding: 8, background: '#fff4cc', borderRadius: 6, color: '#663c00' }}>تنبيه: هناك محاولات إعادة استخدام جديدة — راجع <a href="/admin/activity">سجل النشاط</a></div>
          ) : null}
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#0b2b2b', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>السيريال</th>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>العميل</th>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>الحالة</th>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>ينتهي في</th>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>المتبقي</th>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>deviceId</th>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>تليفون</th>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>مستخدم مرتبط</th>
                <th style={{ border: '1px solid #ddd', padding: 8, background: '#0b2540', color: '#fff', fontWeight: 700 }}>بريد المستخدم</th>
              </tr>
            </thead>
            <tbody>
              {(!licenses || licenses.length === 0) ? (
                <tr><td colSpan={9} style={{ padding: 12, color: '#222' }}>لا توجد تراخيص</td></tr>
              ) : (filteredLicenses.length === 0) ? (
                <tr><td colSpan={9} style={{ padding: 12, color: '#222' }}>لا توجد نتائج مطابقة</td></tr>
              ) : filteredLicenses.map((l) => {
                const s = getVisualStatus(l);
                const now = new Date();
                const expiresAtDate = l.expiresAt ? new Date(l.expiresAt) : null;
                const remDays = expiresAtDate ? Math.ceil((expiresAtDate - now) / (24 * 60 * 60 * 1000)) : null;
                const remDisplay = remDays === null ? '-' : (remDays <= 0 ? 'منتهي' : `${remDays} يوم`);
                // Icons and colors per levels:
                // >15: none
                // 7..15: light warning (no icon)
                // 3..6: clear warning (orange + icon)
                // <3: strong warning (red + 🚨)
                const alertIcon = (remDays !== null && remDays > 0) ? (remDays < 3 ? '🚨' : (remDays <= 6 ? '⚠️' : '')) : '';
                const remTextColor = (remDays === null) ? '#0b2b2b' : (remDays <= 0 ? '#4b0000' : (remDays < 3 ? '#8b0000' : (remDays <= 6 ? '#8b4500' : '#0b2b2b')));
                return (
                  <tr key={l.key || l.id} style={{ background: rowBg(s.code) }}>
                    <td style={{ border: '1px solid #eee', padding: 8, fontFamily: 'monospace', display: 'flex', gap: 8, alignItems: 'center', color: '#0b2b2b' }} onClick={() => openDetails(l)}>
                      <div style={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {alertIcon ? <div title="تنبيه قرب الانتهاء" style={{ fontSize: 18 }}>{alertIcon}</div> : null}
                        {l.reuseAttempts && Number(l.reuseAttempts) > 0 ? (
                          <div title={`محاولات إعادة استخدام (${l.reuseAttempts})`} style={{ fontSize: 18, marginLeft: 4 }}>🔁</div>
                        ) : null}
                        <div style={{ display: 'inline-block', background: '#ffffff', color: '#0b2b2b', padding: '6px 10px', borderRadius: 8, fontWeight: 700, fontSize: 13, boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>{prettifySerial(l.key || l.serial || l.licenseKey)}</div>
                      </div>
                      <div style={{ marginLeft: 8 }}>
                        <button className="btn" style={{ padding: '6px 10px' }} onClick={(e) => { e.stopPropagation(); copySerial(l.key || l.serial || l.licenseKey); }}>
                          نسخ
                        </button>
                        {copied === (l.key || l.serial || l.licenseKey) ? <span style={{ marginLeft: 8, color: 'green' }}>تم النسخ</span> : null}
                      </div>
                    </td>
                    <td style={{ border: '1px solid #eee', padding: 8, color: '#0b2b2b' }} onClick={() => openDetails(l)}>{l.user?.id ? `${l.user.id} — ${l.user?.name || '-'}` : 'غير مربوط بعد'}</td>
                    <td style={{ border: '1px solid #eee', padding: 8, color: '#0b2b2b', fontWeight: 600 }} onClick={() => openDetails(l)}>
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 18 }}>{s.emoji}</span>
                        <span>{s.label}</span>
                      </span>
                    </td>
                    <td style={{ border: '1px solid #eee', padding: 8, color: '#0b2b2b' }} onClick={() => openDetails(l)}>{l.expiresAt ? new Date(l.expiresAt).toLocaleString() : '-'}</td>
                    <td style={{ border: '1px solid #eee', padding: 8, color: remTextColor, background: remainingColor(remDays), fontWeight: 700, textAlign: 'center', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }} onClick={() => openDetails(l)}>
                      {alertIcon ? <span style={{ fontSize: 18 }}>{alertIcon}</span> : null}
                      <span>{remDisplay}</span>
                    </td>
                    <td style={{ border: '1px solid #eee', padding: 8, color: '#0b2b2b' }} onClick={() => openDetails(l)}>{l.deviceId || '-'}</td>
                    <td style={{ border: '1px solid #eee', padding: 8, color: '#0b2b2b' }} onClick={() => openDetails(l)}>{l.user?.phone || 'غير مربوط بعد'}</td>
                    <td style={{ border: '1px solid #eee', padding: 8, display: 'flex', gap: 8, justifyContent: 'flex-end', color: '#0b2b2b' }}>
                      <div style={{ flex: 1, textAlign: 'right' }}>{l.user?.email || 'غير مربوط بعد'}</div>
                      { (trader && (trader.role === 'ADMIN' || trader.id === 'a23af08a-979d-4dcb-b0bd-490ce7152eb0')) ? (
                        (s.code === 5) ? (
                          <>
                            <button className="btn" onClick={() => unblockLicense(l.key || l.serial || l.licenseKey)}>إلغاء الحظر</button>
                            <button className="btn" onClick={() => { if (!confirm('هل تود إعادة تعيين هذا السيريال؟')) return; resetLicense(l.key || l.serial || l.licenseKey); }}>إعادة تعيين</button>
                            <button className="btn" onClick={(e) => { e.stopPropagation(); navigate(`/admin/activity?q=${encodeURIComponent(l.key || l.serial || l.licenseKey)}`); }} style={{ marginLeft: 8 }}>عرض السجل</button>
                          </>
                        ) : (
                          <>
                            <button className="btn back-red" onClick={() => {
                              if (!confirm('هل تود حظر هذا السيريال؟')) return; blockLicense(l.key || l.serial || l.licenseKey);
                            }}>حظر</button>
                            <button className="btn" onClick={() => { if (!confirm('هل تود إعادة تعيين هذا السيريال؟')) return; resetLicense(l.key || l.serial || l.licenseKey); }}>إعادة تعيين</button>
                            <button className="btn" onClick={(e) => { e.stopPropagation(); navigate(`/admin/activity?q=${encodeURIComponent(l.key || l.serial || l.licenseKey)}`); }} style={{ marginLeft: 8 }}>عرض السجل</button>
                          </>
                        )
                      ) : (
                        <div style={{ color: '#666' }}>غير متاح</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </>
        )}

      {/* Details modal */}
      {selected ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={closeDetails}>
          <div style={{ background: '#fff', padding: 16, minWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>تفاصيل السيريال</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1, fontWeight: 700, color: '#111', fontSize: 14 }}>{(selected.key || selected.serial || selected.licenseKey)}</div>
              <div>
                <button className="btn" onClick={() => copySerial(selected.key || selected.serial || selected.licenseKey)}>نسخ</button>
                {copied === (selected.key || selected.serial || selected.licenseKey) ? <div style={{ color: 'green', marginTop: 6 }}>تم النسخ</div> : null}
              </div>
            </div>
            <div style={{ marginTop: 8 }}>الحالة: {getVisualStatus(selected).label}</div>
            <div>ينتهي في: {selected.expiresAt || '-'}</div>
            <div>الجهاز: {selected.deviceId || '-'}</div>
            <div>العميل: {selected.user?.id ? `${selected.user.id} — ${selected.user.name || '-'}` : 'غير مربوط بعد'}</div>
            <div>التليفون: {selected.user?.phone || '-'}</div>
            <div>البريد: {selected.user?.email || '-'}</div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {getVisualStatus(selected).code === 5 ? (
                <button className="btn" onClick={() => { unblockLicense(selected.key || selected.serial || selected.licenseKey); closeDetails(); }}>إلغاء الحظر</button>
              ) : (
                <button className="btn back-red" onClick={() => { if (!confirm('حظر السيريال؟')) return; blockLicense(selected.key || selected.serial || selected.licenseKey); closeDetails(); }}>حظر</button>
              )}
              <button className="btn" onClick={closeDetails}>إغلاق</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
