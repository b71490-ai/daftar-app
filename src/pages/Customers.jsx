import { useMemo, useRef, useState } from "react";
import Modal from "../components/Modal";
import {
  addCustomer,
  listCustomers,
  removeCustomer,
  updateCustomer,
} from "../store/customers";

export default function Customers({ onBack }) {
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");
  const [editId, setEditId] = useState(null);
  const [err, setErr] = useState("");
  const [showDupConfirm, setShowDupConfirm] = useState(false);
  const [dupCandidate, setDupCandidate] = useState(null);

  // cached customers (not used directly; use `list` for filtered view)
  // ملاحظة: localStorage ما يعمل reactive، بنعمل refresh بسيط بتغيير state
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((x) => x + 1);
  const nameRef = useRef(null);
  const [_showNotif, setShowNotif] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toDeleteId, setToDeleteId] = useState(null);

  const list = useMemo(() => {
    const all = listCustomers();
    const raw = q.trim();
    if (!raw) return all;

    const toWestern = (s) => String(s || "").replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

    const sLower = raw.toLowerCase();
    const sDigits = toWestern(raw).replace(/[^0-9]/g, "");

    return all.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const phone = String(toWestern(c.phone || "")).replace(/[^0-9]/g, "");
      const whatsapp = String(toWestern(c.whatsapp || "")).replace(/[^0-9]/g, "");

      const nameMatch = name.includes(sLower);
      const phoneMatch = sDigits && (phone.includes(sDigits) || whatsapp.includes(sDigits));
      return nameMatch || phoneMatch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tick]);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2;
  }, [name]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setWhatsapp("");
    setNotes("");
    setEditId(null);
    setErr("");
  };

  const submit = (e) => {
    e?.preventDefault?.();
    setErr("");

    if (!canSubmit) {
      setErr("اسم العميل مطلوب (حرفين على الأقل).");
      return;
    }

    // detect duplicates by name or phone
    const all = listCustomers();
    const nameNorm = name.trim().toLowerCase();
    const phoneNorm = String(phone || "").replace(/[^0-9]/g, "");

    if (!editId) {
      const dup = all.find((c) => {
        const cName = (c.name || "").trim().toLowerCase();
        const cPhone = (c.phone || "").toString().replace(/[^0-9]/g, "");
        if (cName && nameNorm && cName === nameNorm) return true;
        if (phoneNorm && cPhone && phoneNorm === cPhone) return true;
        return false;
      });
      if (dup) {
        // show confirmation modal instead of hard error
        setDupCandidate({ name, phone, whatsapp, notes });
        setShowDupConfirm(true);
        return;
      }

      addCustomer({ name, phone, whatsapp, notes });
    } else {
      updateCustomer(editId, { name, phone, whatsapp, notes });
    }

    resetForm();
    refresh();
    setShowFormModal(false);
  };

  const confirmAddDuplicate = () => {
    if (!dupCandidate) return setShowDupConfirm(false);
    addCustomer(dupCandidate);
    setShowDupConfirm(false);
    setDupCandidate(null);
    resetForm();
    refresh();
    setShowFormModal(false);
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setName(c.name || "");
    setPhone(c.phone || "");
    setWhatsapp(c.whatsapp || "");
    setNotes(c.notes || "");
  };

  const del = (id) => {
    setToDeleteId(id);
    setShowConfirm(true);
  };

  const confirmDelete = () => {
    if (toDeleteId) removeCustomer(toDeleteId);
    setShowConfirm(false);
    setToDeleteId(null);
    refresh();
    if (editId === toDeleteId) resetForm();
  };

  const _focusAdd = () => {
    setShowNotif(false);
    setTimeout(() => {
      nameRef.current?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  };

  const toWaNumber = (raw) => {
    if (!raw) return "";
    // normalize Arabic-Indic digits to western digits first
      const toWestern = (s) => String(s || "").replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
    let n = toWestern(String(raw)).replace(/[^0-9]/g, "");
    if (n.startsWith("0")) n = n.slice(1);
    if (n.length === 9) n = "967" + n;
    if (n.length === 10 && n.startsWith("7")) n = "967" + n;
    return n;
  };

  const openWhatsapp = (raw) => {
    const wa = toWaNumber(raw);
    if (!wa) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'لا يوجد رقم واتساب لهذا العميل', type: 'error' } }));
      return;
    }
    const url = `https://wa.me/${wa}`;
    const w = window.open(url, "_blank");
    if (!w) window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'تعذّر فتح نافذة جديدة — انسخ الرقم وأرسله يدويًا.', type: 'error' } }));
  };

  return (
    <div className="container" dir="rtl">
      <div className="card customers-card" style={{ width: "100%", position: "relative" }}>
        <div className="customers-header">
          <div className="customers-title">
            <button className="btn ghost small back-red" onClick={onBack}>رجوع</button>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="logo" />
              <div>
                <h1 className="h1">العملاء</h1>
                <p className="p">إدارة العملاء — بحث سريع، إضافة وتعديل وإيقاف (بدلاً من الحذف النهائي).</p>
              </div>
            </div>
          </div>

          <div className="customers-controls">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="bell" onClick={() => setShowNotif((s) => !s)}>🔔<span className="badge">3</span></div>
              <div className="avatar">د</div>
            </div>
          </div>
        </div>

        {/* إضافة / تعديل */}
        <form className="form" onSubmit={submit}>
          <div className="row">
            <div className="col">
                  <div className="label">اسم العميل *</div>
                    <input
                      ref={nameRef}
                      className="input"
                      placeholder="مثال: أحمد محمد"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
            </div>
            <div className="col">
              <div className="label">رقم الجوال</div>
              <input
                className="input"
                placeholder="مثال: 777123456"
                value={phone}
                onChange={(e) => setPhone(String(e.target.value).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) >= 0x06F0 ? d.charCodeAt(0) - 0x06F0 : d.charCodeAt(0) - 0x0660)).replace(/\s/g, ""))}
                inputMode="tel"
              />
            </div>
            <div className="col">
              <div className="label">رقم واتساب (اختياري)</div>
              <input
                className="input"
                placeholder="مثال: 770123456"
                value={whatsapp}
                onChange={(e) => setWhatsapp(String(e.target.value).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) >= 0x06F0 ? d.charCodeAt(0) - 0x06F0 : d.charCodeAt(0) - 0x0660)).replace(/\D/g, ""))}
                inputMode="tel"
              />
            </div>
          </div>

          <div>
            <div className="label">ملاحظات</div>
            <input
              className="input"
              placeholder="مثال: يشتري جملة / آجل أسبوع"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {err ? <div className="err">{err}</div> : null}

          <div className="row">
            <button className="btn" type="button" onClick={() => setShowFormModal(true)}>
              ➕ إضافة عميل
            </button>

            <button
              type="button"
              className="btn"
              onClick={resetForm}
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.08))",
                boxShadow: "none",
                width: 160,
              }}
            >
              تفريغ
            </button>
          </div>

          <div className="note">
            عدد العملاء: <b>{list.length}</b>
          </div>
        </form>

        {/* بحث */}
        <div className="search-row">
          <div>
            <div className="label">بحث</div>
            <input
              className="input"
              placeholder="اكتب اسم أو رقم..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="quick-stats">
            <div className="label">عدد العملاء</div>
            <div className="p"><b>{list.length}</b></div>
          </div>
        </div>

        {/* قائمة العملاء */}
        <div className="customer-grid">
          {list.length === 0 ? (
            <div className="note">لا يوجد عملاء بعد.</div>
          ) : (
            list.map((c) => (
              <div className="customer-card" key={c.id}>
                <div className="customer-main">
                  <div className="avatar small">{(c.name || "?").charAt(0)}</div>
                  <div className="customer-info">
                    <div className="customer-name">{c.name}</div>
                    <div className="customer-meta">
                      {c.phone ? `📞 ${c.phone}` : "📞 بدون رقم"}
                      {c.whatsapp ? ` • 💬 ${c.whatsapp}` : ""}
                      {c.notes ? ` • 📝 ${c.notes}` : ""}
                    </div>
                  </div>
                </div>

                <div className="customer-actions">
                  <button className="btn outline small" type="button" onClick={() => { startEdit(c); setShowFormModal(true); }}>✏️ تعديل</button>
                  <button className="btn small wa" type="button" onClick={() => openWhatsapp(c.whatsapp || c.phone)}>💬 واتساب</button>
                  <button className="btn small del" type="button" onClick={() => del(c.id)}>⛔ إيقاف</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {showFormModal ? (
        <Modal
          title={editId ? "تعديل العميل" : "إضافة عميل"}
          onClose={() => {
            setShowFormModal(false);
            resetForm();
          }}
        >
          <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
            <div>
              <div className="label">اسم العميل *</div>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <div className="label">رقم الجوال</div>
              <input className="input" value={phone} onChange={(e) => setPhone(String(e.target.value).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) >= 0x06F0 ? d.charCodeAt(0) - 0x06F0 : d.charCodeAt(0) - 0x0660)).replace(/\s/g, ""))} />
            </div>

            <div>
              <div className="label">رقم واتساب (اختياري)</div>
              <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(String(e.target.value).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) >= 0x06F0 ? d.charCodeAt(0) - 0x06F0 : d.charCodeAt(0) - 0x0660)).replace(/\D/g, ""))} />
            </div>

            <div>
              <div className="label">ملاحظات</div>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {err ? <div className="err">{err}</div> : null}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" type="submit">
                {editId ? "حفظ التعديل" : "إضافة"}
              </button>
              <button type="button" className="btn ghost" onClick={() => { setShowFormModal(false); resetForm(); }}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showDupConfirm ? (
        <Modal title="عميل مشابه موجود" onClose={() => setShowDupConfirm(false)}>
          <div className="note">يوجد عميل بنفس الاسم أو رقم الجوال. هل تريد المتابعة وإضافة العميل مع ذلك؟</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="btn" onClick={confirmAddDuplicate}>إضافة مع ذلك</button>
            <button className="btn ghost" onClick={() => { setShowDupConfirm(false); setDupCandidate(null); }}>إلغاء</button>
          </div>
        </Modal>
      ) : null}

      {showConfirm ? (
        <Modal title="تأكيد الإيقاف" onClose={() => setShowConfirm(false)}>
          <div className="note">هل تريد إيقاف هذا العميل (سيُمنع عن الاستخدام لكنه لن يُحذف نهائياً)؟</div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn" onClick={confirmDelete}>
              إيقاف
            </button>
            <button className="btn ghost" onClick={() => setShowConfirm(false)}>
              إلغاء
            </button>
          </div>
        </Modal>
      ) : null}

    </div>
  );
}