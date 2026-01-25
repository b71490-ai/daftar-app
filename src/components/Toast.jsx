import { useEffect, useState } from 'react';

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const t = { id: Math.random().toString(36).slice(2,9), ...e.detail };
      setToasts(s => [t, ...s]);
      setTimeout(() => {
        setToasts(s => s.filter(x => x.id !== t.id));
      }, 3600);
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);

  if (!toasts.length) return null;

  return (
    <div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ minWidth: 220, padding: '8px 12px', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', background: t.type === 'error' ? '#fdecea' : t.type === 'success' ? '#ecfdf5' : '#f0f9ff', color: t.type === 'error' ? '#9f1239' : t.type === 'success' ? '#065f46' : '#064e3b', fontSize: 13 }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
