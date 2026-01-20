import { useMemo, useState } from "react";
import { getCustomer, listCustomers } from "../store/customers";
import { getTrader } from "../store/auth";
import {
  addDebt,
  addPayment,
  calcSummary,
  listTxByCustomer,
  removeTx,
  updateTx,
} from "../store/ledger";

export default function Debts({ onBack, onOpenStatement }) {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((x) => x + 1);

  // Intentional: recompute when `tick` changes (local refresh trigger)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const customers = useMemo(() => listCustomers(), [tick]);
  const [selectedId, setSelectedId] = useState(customers?.[0]?.id || "");
  const [searchQ, setSearchQ] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Intentional: recompute when `selectedId` or `tick` changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const customer = useMemo(() => (selectedId ? getCustomer(selectedId) : null), [selectedId, tick]);
  // Intentional: recompute when `selectedId` or `tick` changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => (selectedId ? calcSummary(selectedId) : null), [selectedId, tick]);
  // Intentional: recompute when `selectedId` or `tick` changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const txs = useMemo(() => (selectedId ? listTxByCustomer(selectedId) : []), [selectedId, tick]);

  const [type, setType] = useState("debt"); // debt | pay
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState(null);

  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const fmtDate = (d) => d;

  // normalize Arabic-indic and Eastern Arabic digits to western 0-9
  const toWesternDigits = (val) => {
    if (val == null) return "";
    return String(val)
      .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
  };

  // suggestions for customer search (name or phone)
  const suggestions = (searchQ || showSuggestions)
    ? customers.filter((c) => {
        const qRaw = String(searchQ || "").trim();
        if (!qRaw) return true;
        const qLower = qRaw.toLowerCase();
        const qDigits = toWesternDigits(qRaw).replace(/[^0-9]/g, "");

        const name = (c.name || "").toLowerCase();
        const phone = String(toWesternDigits(c.phone || "")).replace(/[^0-9]/g, "");
        const whatsapp = String(toWesternDigits(c.whatsapp || "")).replace(/[^0-9]/g, "");

        if (name.includes(qLower)) return true;
        if (qDigits && (phone.includes(qDigits) || whatsapp.includes(qDigits))) return true;
        return false;
      })
    : [];

  const printReceipt = (tx) => {
    try {
      const c = customer || getCustomer(tx.customerId);
      const trader = getTrader();
      const logoImg = trader?.logo
        ? `<div style="text-align:center;margin-bottom:10px"><img src="${trader.logo}" style="height:64px;border-radius:8px;object-fit:cover"/></div>`
        : "";
      const receiptNo = tx.id ? String(tx.id).slice(0, 8).toUpperCase() : "-";
      const dateTime = tx.createdAt || new Date().toISOString();
      const html = `
      <html lang="ar"><head><meta charset="utf-8"/><title>سند استلام</title>
      <style>
        body{font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; direction: rtl; color:#111; padding:18px;}
        .card{max-width:520px;margin:0 auto;border:1px solid #e6e6e6;padding:18px;border-radius:10px}
        .hdr{display:flex;justify-content:space-between;align-items:center;gap:12px}
        .meta{font-size:13px;color:#666}
        h1{margin:0;font-size:18px}
        .company{font-weight:800;font-size:16px}
        .section{margin-top:12px}
        .row{display:flex;justify-content:space-between;gap:8px}
        .amount{font-size:20px;font-weight:900;margin-top:8px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        td,th{padding:8px;border-bottom:1px solid #f0f0f0;text-align:right}
        .foot{margin-top:14px;color:#666;font-size:13px}
        .sig{margin-top:22px;display:flex;justify-content:space-between;align-items:center}
        .sig .line{width:40%;height:1px;background:#ddd}
      </style>
      </head><body>
      <div class="card">
        ${logoImg}
        <div class="hdr">
          <div>
            <div class="company">${trader?.name || ''}</div>
            <div class="meta">${trader?.address || ''}</div>
            <div class="meta">${trader?.phone || ''}</div>
          </div>
          <div style="text-align:left">
            <div style="font-size:12px;color:#666">سند استلام</div>
            <div style="font-weight:800;margin-top:6px">#${receiptNo}</div>
          </div>
        </div>

        <div class="section">
          <div class="row"><div>المستلم:</div><div style="font-weight:700">${c?.name || '-'}</div></div>
          <div class="row"><div>جوال:</div><div>${c?.phone || '-'}</div></div>
          <div class="row"><div>التاريخ:</div><div>${dateTime}</div></div>
        </div>

        <table>
          <thead>
            <tr><th style="text-align:right">الوصف</th><th style="text-align:left">المبلغ</th></tr>
          </thead>
          <tbody>
            <tr><td>${tx.note || (tx.reason ? tx.reason : 'سداد')}</td><td style="text-align:left">${fmt(tx.amount)}</td></tr>
          </tbody>
        </table>

        <div class="amount">المجموع: ${fmt(tx.amount)} </div>

        <div class="sig">
          <div>
            <div class="line"></div>
            <div style="font-size:12px;color:#666;text-align:right">توقيع المستلم</div>
          </div>
          <div style="text-align:left;font-size:12px;color:#999">نظام دفتر</div>
        </div>

        <div class="foot">هذا السند بمثابة إيصال عن المبلغ المدفوع.</div>
      </div>
      <script>window.print();</script>
      </body></html>
      `;

      // Use a Blob + object URL to open the receipt reliably
      try {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        // try opening a tab with the object URL
        let w = null;
        try {
          w = window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
          w = null;
        }

        if (w) {
          try { w.opener = null; } catch { /* ignore */ }
        } else {
          // popup blocked — fallback to anchor click
          try {
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch {
            // final fallback: copy receipt HTML to clipboard and notify user
            try { navigator.clipboard?.writeText(html); alert('تم نسخ محتوى السند إلى الحافظة'); } catch { /* ignore */ }
          }
        }

        // revoke URL after a short delay
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 5000);
      } catch { try { navigator.clipboard?.writeText(html); alert('تم نسخ محتوى السند إلى الحافظة'); } catch { /* ignore */ } }
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setAmount("");
    setReason("");
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
    setEditingId(null);
    setErr("");
  };

  const onAdd = () => {
    setErr("");
    if (!selectedId) return setErr("اختر عميلًا أولاً");
    const v = Number(toWesternDigits(String(amount)).replace(/[^0-9.-]/g, ""));
    if (!v || isNaN(v) || v <= 0) return setErr("أدخل مبلغًا صالحًا");
    if (type === "debt") {
      if (!reason || !String(reason).trim()) return setErr("أدخل سببًا للدين");
    }

    let tx = null;
      if (editingId) {
      // update existing tx
      const patch = { amount: v, date };
      if (type === "debt") patch.reason = reason.trim();
      else patch.note = note.trim();
      tx = updateTx(editingId, patch);
    } else {
      if (type === "debt") {
        tx = addDebt({ customerId: selectedId, amount: v, date, reason: reason.trim() });
      } else {
        tx = addPayment({ customerId: selectedId, amount: v, date, note: note.trim() });
      }
    }

    resetForm();
    refresh();
    // إذا كان سداد، نفتح سند الطباعة
    if (type !== "debt" && tx) {
      printReceipt(tx);
    }
  };

  const onRemove = (id) => {
    if (!confirm("هل تريد حذف هذه الحركة؟")) return;
    removeTx(id);
    refresh();
  };

  return (
    <div className="container" dir="rtl">
      <div className="debt-grid">
        <aside className="debt-left card">
          <div className="brand" style={{ gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="logo" />
              <div>
                <h2 className="h2">الديون والسداد</h2>
                <p className="p" style={{ marginTop: 6 }}>اختر عميل ثم أضف دين أو سداد.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn back-red" onClick={onBack}>رجوع</button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="label">العميل</div>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                placeholder="ابحث باسم أو رقم العميل..."
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              />

              {showSuggestions && suggestions.length > 0 ? (
                <div className="typeahead" style={{ position: 'absolute', left: 0, right: 0, zIndex: 11000 }}>
                  {suggestions.slice(0, 8).map((c) => (
                    <div
                      key={c.id}
                      className="typeahead-item"
                      onMouseDown={(ev) => { ev.preventDefault(); /* keep focus */ }}
                      onClick={() => { setSelectedId(c.id); setSearchQ(c.name || ''); setShowSuggestions(false); }}
                    >
                      <div style={{ fontWeight: 800 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.phone ? `📞 ${c.phone}` : 'بدون رقم'}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {customer && summary ? (
            <div className="summary-card" style={{ marginTop: 12 }}>
              <div className="summary-top">
                <div className="summary-name" title={customer.name}>{customer.name}</div>
                <div className="summary-balance">{fmt(summary.balance)}</div>
              </div>
              <div className="summary-details">
                <div>إجمالي الديون: <b>{fmt(summary.totalDebt)}</b></div>
                <div>إجمالي السداد: <b>{fmt(summary.totalPaid)}</b></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn back-red" onClick={onBack}>رجوع</button>
                <button className="btn" onClick={() => onOpenStatement?.(selectedId)} disabled={!selectedId}>كشف الحساب</button>
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <div className="label">إضافة / سداد</div>

            <div style={{ marginTop: 12 }}>
              <div className="label">التاريخ</div>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="add-row" style={{ marginTop: 8 }}>
              <div className="add-inputs" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input"
                  placeholder="المبلغ"
                  value={amount}
                  onChange={(e) => setAmount(toWesternDigits(e.target.value).replace(/[^0-9.-]/g, ""))}
                  style={{ flex: '0 0 140px' }}
                />

                <select className="input" value={type} onChange={(e) => setType(e.target.value)} style={{ flex: '0 0 140px' }}>
                  <option value="debt">دين</option>
                  <option value="pay">سداد</option>
                </select>
              </div>
              <div style={{ marginTop: 10 }}>
                {type === "debt" ? (
                  <div>
                    <div className="label">سبب الدين</div>
                    <input className="input small" placeholder="مثال: مواد غذائية / جملة" value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                ) : (
                  <div>
                    <div className="label">ملاحظة السداد</div>
                    <input className="input small" placeholder="مثال: سداد نقدًا / تحويل" value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="add-button" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button className="btn" onClick={onAdd} disabled={!selectedId || !amount}>{editingId ? 'حفظ' : 'إضافة'}</button>
                {editingId ? (
                  <button className="btn ghost" onClick={() => { if (confirm('إلغاء التعديل والعودة؟')) { resetForm(); } }}>إلغاء</button>
                ) : null}
              </div>
            </div>

            {err ? <div className="err" style={{ marginTop: 8 }}>{err}</div> : null}
          </div>
        </aside>

        <main className="debt-right card">
          <div className="label">الحركات</div>
          <div style={{ marginTop: 8 }}>
            {txs.length === 0 ? (
              <div className="empty">لا توجد حركات بعد</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {txs.map((t) => (
                  <div key={t.id} className={`tx-row ${t.type === 'debt' ? 'debt' : 'pay'}`}>
                    <div className="tx-main">
                      <div className="tx-title">{t.type === 'debt' ? 'دين' : 'سداد'}</div>
                      <div className="tx-note">{t.type === 'debt' ? (t.reason || '-') : (t.note || '-')}</div>
                    </div>
                    <div className="tx-meta">
                      <div className="tx-amount">{fmt(t.amount)}</div>
                      <div className="tx-date">{fmtDate(t.date)}</div>
                    </div>
                    <div className="tx-actions">
                      <button className="btn small" onClick={() => {
                        // load tx into form for editing
                        setEditingId(t.id);
                        setType(t.type === 'debt' ? 'debt' : 'pay');
                        setAmount(String(t.amount).replace(/[^0-9.-]/g, ""));
                        setDate(t.date || new Date().toISOString().slice(0,10));
                        setReason(t.reason || '');
                        setNote(t.note || '');
                        // focus not implemented: user can edit fields
                      }}>تعديل</button>
                      <button className="btn small ghost" onClick={() => { if (confirm('هل تريد إلغاء التعديل؟')) { setEditingId(null); setAmount(''); setReason(''); setNote(''); } }}>إلغاء</button>
                      <button className="btn small outline" onClick={() => onRemove(t.id)}>حذف</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}