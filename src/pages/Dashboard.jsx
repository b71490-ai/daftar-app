import { useEffect, useState } from "react";
import { listCustomers } from "../store/customers";
import { getTrader } from "../store/auth";

export default function Dashboard({ traderName, onLogout, onOpenCustomers, onOpenDebts, onOpenSettings }) {
  const [customersCount, setCustomersCount] = useState(0);
  const [ledgerSummary, setLedgerSummary] = useState({ balance: 0, txCount: 0 });
  const [subscription, setSubscription] = useState({ expiresAt: null, valid: false });

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

  return (
    <div className="container" dir="rtl">
      <div className="card" style={{ maxWidth: 900 }}>
        <div className="brand" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="logo" />
            <div>
              <h1 className="h1">لوحة المتجر {traderName ? `- ${traderName}` : ''}</h1>
              <p className="p">ملخّص ذكي لنشاطك التجاري.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onOpenSettings}>الإعدادات</button>
            <button className="btn back-red" onClick={onLogout}>تسجيل خروج</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="label">العملاء</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{customersCount}</div>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={onOpenCustomers}>افتح العملاء</button>
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
              {subscription.expiresAt ? (
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