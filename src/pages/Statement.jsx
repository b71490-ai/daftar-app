import { useMemo, useState } from "react";
import { getCustomer } from "../store/customers";
import { calcSummary, listTxByCustomer } from "../store/ledger";
import { getTrader } from "../store/auth";

export default function Statement({ customerId, onBack }) {
  const [tick] = useState(0);

  // normalize Arabic-indic and Eastern Arabic digits to western 0-9
  const toWesternDigits = (val) => {
    if (val == null) return "";
    return String(val)
      .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
  };

  // Intentional: recompute when `tick` or `customerId` changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const customer = useMemo(() => (customerId ? getCustomer(customerId) : null), [customerId, tick]);
  // Intentional: recompute when `tick` or `customerId` changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => (customerId ? calcSummary(customerId) : null), [customerId, tick]);
  // Intentional: recompute when `tick` or `customerId` changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const txs = useMemo(() => (customerId ? listTxByCustomer(customerId) : []), [customerId, tick]);
  // Intentional: recompute when `tick` changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trader = useMemo(() => getTrader(), [tick]);

  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const fmtDate = (d) => {
    try {
      return new Date(d).toLocaleString("en-GB", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return d || "";
    }
  };

  const handlePrint = () => {
    // يفتح نافذة الطباعة (ومنها Save as PDF)
    window.print();
  };
  const buildWhatsappText = () => {
    const today = new Date().toISOString().slice(0, 10);
    const lines = [];

    lines.push("كشف حساب");
    if (customer?.name) lines.push(`العميل: ${customer.name}`);
    if (customer?.phone) lines.push(`الجوال: ${customer.phone}`);
    lines.push(`التاريخ: ${today}`);
    lines.push("--------------------");
    lines.push(`إجمالي الديون: ${fmt(summary?.totalDebt)}`);
    lines.push(`إجمالي السداد: ${fmt(summary?.totalPay)}`);
    lines.push(`الرصيد الحالي: ${fmt(summary?.balance)}`);
    lines.push("--------------------");

    // آخر 8 عمليات فقط (عشان يكون خفيف)
    const last = (txs || []).slice(0, 8).reverse(); // من الأقدم للأحدث في الرسالة
    if (last.length === 0) {
      lines.push("لا توجد عمليات.");
    } else {
      lines.push("آخر العمليات:");
      for (const t of last) {
        const kind = t.type === "debt" ? "دين" : "سداد";
        const desc = t.type === "debt" ? (t.reason || "-") : (t.note || "-");
        lines.push(`${t.date} | ${kind} | ${desc} | ${fmt(t.amount)}`);
      }
    }

    lines.push("--------------------");
    lines.push("تم الإرسال من: دفتر — نظام الديون");

    return lines.join("\n");
  };
  const toWaNumber = (raw) => {
    if (!raw) return "";
    // convert digits to western and keep digits only
    let n = toWesternDigits(raw).replace(/[^0-9]/g, "");

    // إذا الرقم يبدأ بـ 0 نشيله
    if (n.startsWith("0")) n = n.slice(1);

    // إذا الرقم محلي (9 أرقام) نضيف كود اليمن 967
    // مثال: 777123456 -> 967777123456
    if (n.length === 9) n = "967" + n;

    // إذا الرقم 10 أرقام (غالبًا 7xxxxxxxxx) نضيف 967
    if (n.length === 10 && n.startsWith("7")) n = "967" + n;

    return n;
  };
  return (
    <div className="container" dir="rtl">
      <div className="card" style={{ width: "min(920px,100%)" }}>
        <div className="statement-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {trader?.logo ? (
              <img src={trader.logo} alt="logo" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
            ) : (
              <div className="logo" />
            )}
            <div>
              <div style={{ fontWeight: 900 }} title={trader?.name || ''}>{trader?.name || '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{trader?.address || ''}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{trader?.phone || ''}</div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <h1 className="h1">كشف الحساب</h1>
            <div className="p" title={customer ? customer.name : ''}>{customer ? customer.name : '—'}</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="no-print">
            <button className="btn ghost back-red" onClick={onBack} style={{ width: 110 }}>رجوع</button>
            <button className="btn" onClick={handlePrint} style={{ width: 140 }}>طباعة PDF</button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                const text = buildWhatsappText();
                const waNum = toWaNumber(customer?.whatsapp || customer?.phone);
                if (!waNum) {
                  navigator.clipboard?.writeText(text);
                  alert("لا يوجد رقم للعميل ✅ تم نسخ النص للحافظة، ألصقه في واتساب");
                  return;
                }
                const url = `https://wa.me/${waNum}?text=${encodeURIComponent(text)}`;
                        const win = window.open(url, '_blank');
                        if (!win) {
                          // popup blocked — navigate in same tab as fallback
                          try { window.location.href = url; }
                          catch { navigator.clipboard?.writeText(text); alert('تم نسخ النص للحافظة ✅ ألصقه في واتساب'); }
                        }
              }}
              style={{ background: 'linear-gradient(135deg, rgba(34,197,94,.95), rgba(16,185,129,.85))' }}
            >
              مشاركة واتساب
            </button>
          </div>
        </div>

        {!customer || !summary ? (
          <div className="note" style={{ marginTop: 12 }}>اختر عميلًا من صفحة الديون أولًا.</div>
        ) : (
          <>
            <div className="statement-summary" style={{ marginTop: 14 }}>
              <div className="summary-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>إجمالي الديون</div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{fmt(summary.totalDebt)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>إجمالي السداد</div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{fmt(summary.totalPay)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>الرصيد الحالي</div>
                    <div style={{ fontWeight: 900, fontSize: 20, color: summary.balance < 0 ? 'var(--danger)' : 'inherit' }}>{fmt(summary.balance)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="statement-txs" style={{ marginTop: 16 }}>
              <div className="tx-header" style={{ fontWeight: 800, color: 'var(--muted)', padding: '8px 12px' }}>
                <div className="hdr-date">التاريخ</div>
                <div className="hdr-type">النوع</div>
                <div className="hdr-desc">البيان</div>
                <div className="hdr-amount">المبلغ</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {txs.length === 0 ? (
                  <div className="note">لا توجد عمليات.</div>
                ) : (
                  txs.map((t) => (
                    <div key={t.id} className={`tx-row ${t.type === 'debt' ? 'debt' : 'pay'}`}>
                      <div className="tx-date">{fmtDate(t.date)}</div>
                      <div className="tx-type" style={{ fontWeight: 800 }}>{t.type === 'debt' ? 'دين' : 'سداد'}</div>
                      <div className="tx-desc">{t.type === 'debt' ? (t.reason || '-') : (t.note || '-')}</div>
                      <div className="tx-amount" style={{ fontWeight: 900 }}>{fmt(t.amount)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}