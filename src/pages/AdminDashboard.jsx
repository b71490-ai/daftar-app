import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTrader, getSession } from '../store/auth';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const trader = getTrader();
  const isAdmin = trader && (trader.role === 'ADMIN' || trader.id === 'a23af08a-979d-4dcb-b0bd-490ce7152eb0');

  const [counts, setCounts] = useState({ active: 0, expiring: 0, expired: 0, blocked: 0, reuse: 0 });
  const mounted = useRef(true);

  const fetchCounts = async () => {
    try {
      const session = getSession();
      const token = session?.traderId || trader?.id || null;
      if (!token) return;

      // fetch licenses and activity reuse attempts
      const [rl, ra] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/admin/licenses`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json().catch(()=>({licenses:[]})) : ({ licenses: [] })).catch(()=>({ licenses: [] })),
        fetch(`${import.meta.env.VITE_API_URL}/admin/activity?action=${encodeURIComponent('محاولة إعادة استخدام')}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json().catch(()=>({entries:[]})) : ({ entries: [] })).catch(()=>({ entries: [] })),
      ]);

      const licenses = Array.isArray(rl) ? rl : (rl?.licenses || []);
      const entries = Array.isArray(ra?.entries) ? ra.entries : (ra?.entries || []);

      const now = new Date();
      let active = 0, expiring = 0, expired = 0, blocked = 0;
      for (const l of licenses) {
        const s = String(l.status || '').toUpperCase();
        const blockedFlag = l.blocked || s === 'BLOCKED' || s === 'DISABLED';
        if (blockedFlag) { blocked++; continue; }

        const expiresAt = l.expiresAt ? new Date(l.expiresAt) : null;
        if (expiresAt && expiresAt < now) { expired++; continue; }

        if (expiresAt) {
          const rem = Math.ceil((expiresAt - now) / (24*60*60*1000));
          if (rem > 0 && rem <= 15) { expiring++; continue; }
        }

        // otherwise count as active
        active++;
      }

      const reuse = Array.isArray(entries) ? entries.length : 0;

      if (!mounted.current) return;
      setCounts({ active, expiring, expired, blocked, reuse });
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    mounted.current = true;
    fetchCounts();
    const iv = setInterval(fetchCounts, 10 * 1000);
    return () => { mounted.current = false; clearInterval(iv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Time-series for this month: activations and expirations
  const [tsDays, setTsDays] = useState([]);
  const [tsActivated, setTsActivated] = useState([]);
  const [tsExpired, setTsExpired] = useState([]);

  const fetchTimeSeries = async () => {
    try {
      const session = getSession();
      const token = session?.traderId || trader?.id || null;
      if (!token) return;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth(); // 0-based
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const activatedCounts = new Array(daysInMonth).fill(0);
      const expiredCounts = new Array(daysInMonth).fill(0);

      // fetch activations
      const aRes = await fetch(`${import.meta.env.VITE_API_URL}/admin/activity?action=${encodeURIComponent('تفعيل ناجح')}`, { headers: { Authorization: `Bearer ${token}` } });
      const aBody = aRes.ok ? await aRes.json().catch(()=>({entries:[]})) : { entries: [] };
      const aEntries = Array.isArray(aBody.entries) ? aBody.entries : (aBody?.entries || []);

      // fetch expirations
      const eRes = await fetch(`${import.meta.env.VITE_API_URL}/admin/activity?action=${encodeURIComponent('منتهي الصلاحية')}`, { headers: { Authorization: `Bearer ${token}` } });
      const eBody = eRes.ok ? await eRes.json().catch(()=>({entries:[]})) : { entries: [] };
      const eEntries = Array.isArray(eBody.entries) ? eBody.entries : (eBody?.entries || []);

      const addEntryCounts = (entries, targetArray) => {
        for (const en of entries) {
          try {
            const t = en.time ? new Date(en.time) : null;
            if (!t) continue;
            if (t.getFullYear() !== year || t.getMonth() !== month) continue;
            const day = t.getDate();
            targetArray[day - 1] = (targetArray[day - 1] || 0) + 1;
          } catch (e) { /* ignore */ }
        }
      };

      addEntryCounts(aEntries, activatedCounts);
      addEntryCounts(eEntries, expiredCounts);

      if (!mounted.current) return;
      setTsDays(Array.from({ length: daysInMonth }, (_, i) => i + 1));
      setTsActivated(activatedCounts);
      setTsExpired(expiredCounts);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchTimeSeries();
    const iv2 = setInterval(fetchTimeSeries, 60 * 1000); // refresh every minute
    return () => clearInterval(iv2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Alerts list: combine reuse attempts and near-expiry licenses (<=3 days)
  const [alertsList, setAlertsList] = useState([]);

  const fetchAlerts = async () => {
    try {
      const session = getSession();
      const token = session?.traderId || trader?.id || null;
      if (!token) return;

      const [rl, ra] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/admin/licenses`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json().catch(()=>({licenses:[]})) : ({ licenses: [] })).catch(()=>({ licenses: [] })),
        fetch(`${import.meta.env.VITE_API_URL}/admin/activity?action=${encodeURIComponent('محاولة إعادة استخدام')}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json().catch(()=>({entries:[]})) : ({ entries: [] })).catch(()=>({ entries: [] })),
      ]);

      const licenses = Array.isArray(rl) ? rl : (rl?.licenses || []);
      const reuseEntries = Array.isArray(ra?.entries) ? ra.entries : (ra?.entries || []);

      const now = new Date();
      const nearExpiring = (licenses || []).filter(l => {
        try {
          if (!l.expiresAt) return false;
          const rem = Math.ceil((new Date(l.expiresAt) - now) / (24*60*60*1000));
          return rem > 0 && rem <= 3;
        } catch { return false; }
      }).map(l => ({ type: 'expiring', time: l.expiresAt, license: l.key || l.serial || l.licenseKey, customerName: l.user?.name || l.user?.id || '' }));

      const reuseMapped = (reuseEntries || []).map(e => ({ type: 'reuse', time: e.time, license: e.license, customerName: e.customerName || e.customerId || '' }));

      const combined = [...reuseMapped, ...nearExpiring].filter(Boolean).sort((a,b) => new Date(b.time) - new Date(a.time)).slice(0,5);
      setAlertsList(combined);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchAlerts();
    const iv3 = setInterval(fetchAlerts, 10 * 1000);
    return () => clearInterval(iv3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div style={{ padding: 16 }}>
        <button className="btn" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>رجوع</button>
        <h2>لوحة الإحصائيات — الإدارة</h2>
        <div style={{ marginTop: 12, padding: 16, borderRadius: 8, background: '#fff6f6', color: '#6b2a2a' }}>
          ❌ غير متاح — هذه الصفحة خاصة بمسؤولي النظام.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <button className="btn" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>رجوع</button>
      <h2>لوحة الإحصائيات — الإدارة</h2>

      {/* Trader account summary (show trial info) */}
      <div style={{ marginTop: 12, background: '#fff', padding: 12, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, color: '#666' }}>نوع الحساب</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{trader?.plan === 'trial' ? 'تجريبي' : (trader?.plan || '—')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: '#666' }}>بداية التجربة</div>
            <div style={{ fontWeight: 700 }}>{trader?.trialStartedAt ? new Date(trader.trialStartedAt).toLocaleString() : '-'}</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>انتهاء التجربة</div>
            <div style={{ fontWeight: 700 }}>{trader?.expiresAt ? new Date(trader.expiresAt).toLocaleString() : '-'}</div>
          </div>
        </div>
      </div>

      {/* Shortcuts */}
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => navigate('/admin/licenses?filter=expiring')} style={{ background: '#f9a825', color: '#000' }}>السيريالات قرب الانتهاء</button>
        <button className="btn" onClick={() => navigate('/admin/licenses?filter=blocked')} style={{ background: '#4a4a4a', color: '#fff' }}>السيريالات الموقوفة</button>
        <button className="btn" onClick={() => navigate('/admin/activity')} style={{ background: '#0b2540', color: '#fff' }}>سجل النشاط</button>
        <button className="btn" onClick={() => navigate('/admin/traders')} style={{ background: '#0b73c2', color: '#fff' }}>سجل الحسابات</button>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 12 }}>
            <Card title="🟢 السيريالات النشطة" color="#2e7d32" value={counts.active} />
            <Card title="🟡 قرب الانتهاء" color="#f9a825" value={counts.expiring} />
            <Card title="🔴 المنتهية" color="#b00020" value={counts.expired} />
            <Card title="⚫ الموقوفة" color="#4a4a4a" value={counts.blocked} />
            <Card title="🚨 محاولات إعادة الاستخدام" color="#d00000" value={counts.reuse} />
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 380px', background: '#fff', padding: 12, borderRadius: 10, boxShadow: '0 2px 8px rgba(2,6,23,0.04)' }}>
              <h4 style={{ margin: 0, marginBottom: 8 }}>توزيع السيريالات حسب الحالة</h4>
              <PieChart
                data={[
                  { key: 'active', label: 'نشطة', value: counts.active, color: '#2e7d32' },
                  { key: 'expiring', label: 'قرب الانتهاء', value: counts.expiring, color: '#f9a825' },
                  { key: 'expired', label: 'منتهية', value: counts.expired, color: '#b00020' },
                  { key: 'blocked', label: 'موقوفة', value: counts.blocked, color: '#4a4a4a' },
                  { key: 'reuse', label: 'محاولات إعادة الاستخدام', value: counts.reuse, color: '#d00000' },
                ]}
                size={240}
              />
            </div>

            <div style={{ flex: '1 1 260px', minWidth: 220, background: '#fff', padding: 12, borderRadius: 10, boxShadow: '0 2px 8px rgba(2,6,23,0.04)' }}>
              <h4 style={{ margin: 0, marginBottom: 8 }}>وسيلة إيضاح</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <LegendItem color="#2e7d32">🟢 السيريالات النشطة</LegendItem>
                <LegendItem color="#f9a825">🟡 قرب الانتهاء</LegendItem>
                <LegendItem color="#b00020">🔴 المنتهية</LegendItem>
                <LegendItem color="#4a4a4a">⚫ الموقوفة</LegendItem>
                <LegendItem color="#d00000">🚨 محاولات إعادة الاستخدام</LegendItem>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, background: '#fff', padding: 12, borderRadius: 10, boxShadow: '0 2px 8px rgba(2,6,23,0.04)' }}>
            <h4 style={{ margin: 0, marginBottom: 8 }}>اتجاهات هذا الشهر — التفعيلات والانتهاءات</h4>
            <div style={{ marginTop: 8 }}>
              <TimeSeriesChart days={tsDays} activated={tsActivated} expired={tsExpired} />
            </div>
          </div>

          <div style={{ marginTop: 20, color: '#444' }}>ملاحظات: هذه صفحة لوحة إحصائيات أساسية. الأرقام تحدّث تلقائياً كل 10 ثوانٍ.</div>
        </div>

        <aside style={{ width: 340, flex: '0 0 340px' }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 10, boxShadow: '0 2px 8px rgba(2,6,23,0.04)' }}>
            <h4 style={{ marginTop: 0 }}>قائمة التنبيهات السريعة</h4>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>آخر 5 عناصر — محاولات إعادة استخدام وسيريالات قرب الانتهاء (≤ 3 أيام)</div>
            <AlertsList items={alertsList} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, color, value }) {
  return (
    <div style={{ background: '#fff', padding: 14, borderRadius: 10, boxShadow: '0 2px 8px rgba(2,6,23,0.06)', borderLeft: `6px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#666' }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color }}>{typeof value === 'number' ? value : '—'}</div>
      </div>
      <div style={{ marginTop: 8, height: 6, background: '#f1f1f1', borderRadius: 6 }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 6, background: color, opacity: 0.08 }} />
      </div>
    </div>
  );
}

function LegendItem({ color, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <div style={{ width: 14, height: 14, background: color, borderRadius: 4 }} />
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  );
}

function PieChart({ data = [], size = 200 }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.floor(size / 2 - 6);
  let startAngle = -90; // start at top

  const slices = [];
  for (const d of data) {
    const v = Number(d.value) || 0;
    if (v <= 0) continue;
    const angle = (v / (total || 1)) * 360;
    const endAngle = startAngle + angle;
    const path = describeArc(cx, cy, radius, startAngle, endAngle);
    slices.push({ path, color: d.color, midAngle: startAngle + angle / 2, label: d.label, value: v });
    startAngle = endAngle;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={1} />
        ))}
        {/* center circle for donut look */}
        <circle cx={cx} cy={cy} r={Math.floor(radius * 0.5)} fill="#fff" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 14, fontWeight: 700, fill: '#222' }}>{total}</text>
      </svg>
    </div>
  );
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = (angleDeg - 90) * Math.PI / 180.0;
  return { x: cx + (r * Math.cos(a)), y: cy + (r * Math.sin(a)) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  const d = [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z'
  ].join(' ');
  return d;
}

function TimeSeriesChart({ days = [], activated = [], expired = [], width = 760, height = 220 }) {
  const w = Math.max(360, width);
  const h = height;
  const padding = { top: 12, right: 16, bottom: 28, left: 36 };
  const innerW = w - padding.left - padding.right;
  const innerH = h - padding.top - padding.bottom;

  const maxVal = Math.max(...(activated || []), ...(expired || []), 1);
  const xStep = innerW / Math.max(1, (days.length - 1));

  const pointsFor = (arr) => (arr || []).map((v, i) => ({ x: padding.left + (i * xStep), y: padding.top + innerH - (Number(v || 0) / maxVal) * innerH }));

  const aPoints = pointsFor(activated);
  const ePoints = pointsFor(expired);

  const polylineFor = (pts) => pts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {/* grid lines */}
        {[0,0.25,0.5,0.75,1].map((t, i) => (
          <line key={i} x1={padding.left} x2={w - padding.right} y1={padding.top + innerH * (1 - t)} y2={padding.top + innerH * (1 - t)} stroke="#eee" />
        ))}

        {/* x-axis labels (days) - show a subset to avoid crowding */}
        {(days || []).map((d, i) => {
          if (days.length > 20 && i % Math.ceil(days.length / 10) !== 0) return null;
          const x = padding.left + (i * xStep);
          return <text key={i} x={x} y={h - 6} fontSize={11} textAnchor="middle" fill="#666">{d}</text>;
        })}

        {/* activated polyline */}
        {aPoints.length > 0 ? (
          <polyline points={polylineFor(aPoints)} fill="none" stroke="#2e7d32" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}

        {/* expired polyline */}
        {ePoints.length > 0 ? (
          <polyline points={polylineFor(ePoints)} fill="none" stroke="#b00020" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}

        {/* small circles */}
        {aPoints.map((p, i) => <circle key={`a${i}`} cx={p.x} cy={p.y} r={3} fill="#2e7d32" />)}
        {ePoints.map((p, i) => <circle key={`e${i}`} cx={p.x} cy={p.y} r={3} fill="#b00020" />)}

        {/* legend */}
        <rect x={padding.left} y={6} width={10} height={10} fill="#2e7d32" />
        <text x={padding.left + 14} y={15} fontSize={12} fill="#222">التفعيلات</text>
        <rect x={padding.left + 120} y={6} width={10} height={10} fill="#b00020" />
        <text x={padding.left + 134} y={15} fontSize={12} fill="#222">المنتهية</text>
      </svg>
    </div>
  );
}

function AlertsList({ items = [] }) {
  const navigate = useNavigate();
  const list = Array.isArray(items) ? items : [];

  if (!list || list.length === 0) return <div>لا توجد تنبيهات حالياً</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((it, idx) => (
        <div key={idx} style={{ padding: 8, borderRadius: 8, background: it.type === 'reuse' ? '#fff7f7' : '#fffaf0', border: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 18 }}>{it.type === 'reuse' ? '🚨' : '🟡'}</div>
            <div>
              <div style={{ fontWeight: 700 }}>{it.license || '-'}</div>
              <div style={{ fontSize: 13, color: '#666' }}>{it.customerName || '—'}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>{it.time ? new Date(it.time).toLocaleString() : '-'}</div>
        </div>
      ))}
    </div>
  );
}
