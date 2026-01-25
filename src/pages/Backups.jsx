import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSession, getTrader } from '../store/auth';

export default function Backups() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const session = getSession();
        const trader = getTrader();
        const token = session?.traderId || trader?.id || null;
        if (!token) { nav('/'); return; }
        const res = await fetch('/admin/backups', { headers: { 'Accept': 'application/json', Authorization: `Bearer ${token}` } });
        if (res.status === 401 || res.status === 403) { nav('/'); return; }
        const j = await res.json();
        if (mounted && j.ok) setBackups(j.backups || []);
      } catch (e) { }
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <button onClick={() => nav(-1)} style={{ marginBottom: 12 }}>رجوع</button>
      <h2>سجل النسخ الاحتياطي</h2>
      {loading ? <div>جارٍ التحميل…</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>الأرشيف</th>
              <th>التاريخ</th>
              <th>الحجم</th>
              <th>الحالة</th>
              <th>القناة</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr><td colSpan={5}>لا توجد نسخ محفوظة</td></tr>
            ) : backups.map(b => (
              <tr key={b.name} style={{ borderTop: '1px solid #eee' }}>
                <td>{b.name}</td>
                <td>{b.mtime ? new Date(b.mtime).toLocaleString() : '-'}</td>
                <td>{b.size ? (Math.round(b.size/1024) + ' KB') : '-'}</td>
                <td>{b.status}</td>
                <td>{b.s3 || 'local'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
