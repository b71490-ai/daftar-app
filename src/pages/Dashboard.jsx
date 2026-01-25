import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCustomers } from "../store/customers";
import { getTrader } from "../store/auth";

export default function Dashboard({ traderName, onLogout, onOpenCustomers, onOpenDebts, onOpenSettings }) {
  const navigate = useNavigate();
  const t = getTrader();
  const [customersCount, setCustomersCount] = useState(0);
  const [ledgerSummary, setLedgerSummary] = useState({ balance: 0, txCount: 0 });
  const [subscription, setSubscription] = useState({ expiresAt: null, valid: false });
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const customers = listCustomers();
    setCustomersCount(customers.length);

    // read ledger from localStorage (internal store key)
    try {
      const raw = localStorage.getItem('daftar_ledger_v1');
      const txs = raw ? JSON.parse(raw) : [];
      let debt = 0;
      let pay = 0;
      for (const t of txs) {
        if (t.type === 'debt') debt += Number(t.amount || 0);
        if (t.type === 'payment') pay += Number(t.amount || 0);
      }
      setLedgerSummary({ balance: debt - pay, txCount: txs.length });
    } catch {
      setLedgerSummary({ balance: 0, txCount: 0 });
    }

    const t = getTrader();
    if (t?.expiresAt) {
      const exp = new Date(t.expiresAt);
      const valid = exp.getTime() > Date.now();
      setSubscription({ expiresAt: t.expiresAt, valid });
    } else {
      setSubscription({ expiresAt: null, valid: false });
    }
  }, []);

  // PWA install prompt handling
  useEffect(() => {
    const handler = (e) => {
      try {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowInstall(true);
      } catch (err) { /* ignore */ }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    try {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'تم تثبيت التطبيق', type: 'success' } }));
      } else {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'تم إلغاء التثبيت', type: 'info' } }));
      }
    } catch (e) { /* ignore */ }
    setShowInstall(false);
    setDeferredPrompt(null);
  };

  const handleOpenCustomers = () => {
    const t = getTrader();
    // Admins bypass activation/trial checks
    try {
      if (t && String(t.role || '').toUpperCase() === 'ADMIN') { onOpenCustomers(); return; }
      const now = new Date();
      const activated = t && t.deviceId && t.deviceId === t.id && t.expiresAt && new Date(t.expiresAt) > now;
      const inTrial = t && t.plan === 'trial' && t.expiresAt && new Date(t.expiresAt) > now;
      if (!activated && !inTrial) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'التفعيل مطلوب لفتح سجلات العملاء.', type: 'error' } }));
    } catch { /* ignore */ }
    if (t?.pinDashboard) {
      const attempt = prompt('أدخل رمز الوصول للدفتر:');
      if (String(attempt) !== String(t.pinDashboard)) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'رمز خاطئ', type: 'error' } }));
    }
    onOpenCustomers();
  }

  return (
    <div className="container" dir="rtl">
      <div className="card" style={{ maxWidth: 900 }}>
        <div className="brand" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="logo" />
            <div>
              <h1 className="h1">لوحة المتجر {traderName ? `- ${traderName}` : ''} {t && String(t.role || '').toUpperCase() === 'ADMIN' ? <span className="admin-badge">أدمن النظام</span> : null}</h1>
              <p className="p">ملخّص ذكي لنشاطك التجاري.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={onOpenSettings}>الإعدادات</button>
              {showInstall ? <button className="btn" onClick={handleInstall}>تثبيت التطبيق</button> : null}
              {/* admin-only button (only visible to admin) */}
              {(() => {
                try {
                  const t = getTrader();
                  const ADMIN_ID = 'a23af08a-979d-4dcb-b0bd-490ce7152eb0';
                  if (t && (String(t.role).toUpperCase() === 'ADMIN' || String(t.id) === ADMIN_ID)) {
                    return <button className="btn" onClick={() => navigate('/admin/licenses')}>سيريالات</button>;
                  }
                } catch {}
                return null;
              })()}
              <button className="btn back-red" onClick={onLogout}>تسجيل خروج</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="label">العملاء</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{customersCount}</div>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={handleOpenCustomers}>افتح العملاء</button>
            </div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div className="label">الديون الصافية</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{ledgerSummary.balance.toFixed(2)}</div>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={onOpenDebts}>{`افتح الديون (${ledgerSummary.txCount})`}</button>
            </div>
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div className="label">حالة الاشتراك</div>
            <div style={{ marginTop: 6 }}>
                  {t && String(t.role || '').toUpperCase() === 'ADMIN' ? (
                    <div style={{ fontWeight: 800, color: '#2bb673' }}>حساب إداري كامل</div>
                  ) : subscription.expiresAt ? (
                    <div>
                      <div style={{ fontWeight: 700 }}>{subscription.valid ? 'نشط' : 'منتهي'}</div>
                      <div className="p" style={{ marginTop: 6 }}>{subscription.expiresAt.slice(0,10)}</div>
                    </div>
                  ) : (
                    <div className="p">غير محدد</div>
                  )}
                </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={onOpenSettings}>تحديث الاشتراك</button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="p">الشاشة ذكية: تخفي الأزرار غير الصالحة وتعرض القيم الأساسية فقط.</div>
        </div>
      </div>
    </div>
  );
}