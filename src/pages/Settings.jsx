import { useEffect, useState, useRef } from "react";
import { getTrader, saveTrader } from "../store/auth";

export default function Settings({ onBack, onSaved }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [logo, setLogo] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [serial, setSerial] = useState("");
  const [activInfo, setActivInfo] = useState(null);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => {
    const t = getTrader();
    if (t) {
      setName(t.name || "");
      setType(t.type || "");
      setAddress(t.address || "");
      setPhone(t.phone || "");
      setLogo(t.logo || "");
      setExpiresAt(t.expiresAt || "");
      setSerial(t.serial || "");
      setActivInfo({ deviceId: t.deviceId || null, activatedAt: t.activatedAt || null });
    }
  }, []);

  const resendConfirmation = async () => {
    try {
      const t = getTrader();
      if (!t || !t.email) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'لا يوجد بريد مرجعي لإعادة الإرسال', type: 'error' } }));
      // prevent client-side rapid clicks
      if (resendCooldownSec > 0) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `انتظر ${Math.ceil(resendCooldownSec/60)} دقيقة قبل المحاولة مجددًا`, type: 'error' } }));
      const res = await fetch('/api/resend-confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traderId: t.id }) });
      const b = await res.json().catch(()=>({}));
      if (!res.ok) {
        // Rate limit handling
        if (res.status === 429) {
          const waitMin = Number(b?.retryAfterMinutes || 0);
          if (waitMin > 0) {
            const sec = waitMin * 60;
            setResendCooldownSec(sec);
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            cooldownRef.current = setInterval(() => {
              setResendCooldownSec(s => {
                if (s <= 1) { clearInterval(cooldownRef.current); cooldownRef.current = null; return 0; }
                return s - 1;
              });
            }, 1000);
          }
        }
        return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: b.message || b.error || 'فشل إرسال رابط التأكيد', type: 'error' } }));
      }
      // success
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'تم إرسال رابط تأكيد جديد إلى بريدك.', type: 'success' } }));
      if (typeof b?.remaining === 'number' && b.remaining <= 0) {
        // if no remaining attempts, set a conservative cooldown (e.g., 24h)
        setResendCooldownSec(24 * 60 * 60);
      }
    } catch (e) { window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'فشل الإرسال', type: 'error' } })); }
  };

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  // normalize Arabic-indic and Eastern Arabic digits to western 0-9
  const toWesternDigits = (val) => {
    if (val == null) return "";
    return String(val)
      .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
  };

  const save = () => {
    setErr("");
    if (!name.trim()) return setErr("اسم النشاط مطلوب.");
    if (!phone.trim()) return setErr("رقم الهاتف مطلوب.");

    const t = getTrader() || { id: crypto.randomUUID() };
    const next = {
      ...t,
      name: name.trim(),
      type: type.trim(),
      address: address.trim(),
      phone: phone.trim(),
      logo: logo || "",
      expiresAt: expiresAt || null,
    };
    saveTrader(next);
    // notify parent to refresh trader data immediately
    try { onSaved?.(); } catch { /* ignore */ }
    setSavedMsg("تم حفظ الإعدادات بنجاح ✅");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  // helper to add days to expiry (not currently used)
  // const addDays = (d) => {
  //   const base = expiresAt ? new Date(expiresAt) : new Date();
  //   const next = new Date(base.getTime() + d * 24 * 60 * 60 * 1000);
  //   setExpiresAt(next.toISOString().slice(0, 10));
  // };

  const activateWithSerial = async () => {
    if (!serial?.trim()) return setSavedMsg('أدخل السريل للتفعيل');
    setSavedMsg('جاري التحقق...');
    try {
      const t = getTrader() || { id: crypto.randomUUID() };
      const deviceId = t.id || crypto.randomUUID();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: serial.trim(), deviceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        const errMsg = body?.error || body?.message || 'فشل التفعيل';
        setSavedMsg(errMsg);
        setTimeout(() => setSavedMsg(''), 2500);
        return;
      }

      // Use server-provided expiry if present, otherwise fallback to 1 year
      const serverExpiry = body?.expiresAt ? new Date(body.expiresAt) : null;
      const nextExpiry = serverExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      setExpiresAt(nextExpiry.toISOString().slice(0, 10));

      const next = {
        ...t,
        expiresAt: nextExpiry.toISOString(),
        serial: serial.trim(),
        deviceId: body.deviceId || deviceId,
        activatedAt: body.activatedAt || new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
      };
      saveTrader(next);
      setActivInfo({ deviceId: next.deviceId, activatedAt: next.activatedAt });
      try { onSaved?.(); } catch { /* ignore */ }
      setSavedMsg('تم التفعيل بنجاح ✅');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch {
      setSavedMsg('فشل التفعيل');
      setTimeout(() => setSavedMsg(''), 2000);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(String(reader.result));
    };
    reader.readAsDataURL(f);
  };

  const triggerFile = () => fileRef.current?.click();

  const deleteLogo = () => {
    if (!confirm("هل تريد حذف الشعار؟")) return;
    setLogo("");
    const t = getTrader() || { id: crypto.randomUUID() };
    const next = { ...t, logo: "" };
    saveTrader(next);
    try { onSaved?.(); } catch { /* ignore */ }
    setSavedMsg("تم حذف الشعار ✅");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  const setPin = (which) => {
    const t = getTrader() || {};
    const p1 = prompt('أدخل رمز جديد:');
    if (!p1) return;
    const p2 = prompt('أعد إدخال الرمز للتأكيد:');
    if (p1 !== p2) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'الرمز غير مطابق', type: 'error' } }));
    const next = { ...t };
    if (which === 'dashboard') next.pinDashboard = String(p1);
    if (which === 'settings') next.pinSettings = String(p1);
    saveTrader(next);
    try { onSaved?.(); } catch { /* ignore */ }
    setSavedMsg('تم حفظ الرمز ✅');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const removePin = (which) => {
    if (!confirm('هل تريد حذف الرمز؟')) return;
    const t = getTrader() || {};
    const next = { ...t };
    if (which === 'dashboard') delete next.pinDashboard;
    if (which === 'settings') delete next.pinSettings;
    saveTrader(next);
    try { onSaved?.(); } catch { /* ignore */ }
    setSavedMsg('تم حذف الرمز ✅');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const reset = () => {
    const t = getTrader();
    if (t) {
      setName(t.name || "");
      setType(t.type || "");
      setAddress(t.address || "");
      setPhone(t.phone || "");
    } else {
      setName("");
      setType("");
      setAddress("");
      setPhone("");
    }
    setErr("");
    setSavedMsg("");
  };

  return (
    <div className="container" dir="rtl">
      <div className="card" style={{ width: "min(760px, 100%)" }}>
        <div className="brand" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="logo" />
            <div>
              <h1 className="h1">الإعدادات</h1>
              <p className="p">اعدادات النشاط والتواصل.</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn back-red" onClick={onBack} style={{ width: 120, padding: 10 }}>
              رجوع
            </button>
            <button
              className="btn"
              onClick={save}
              style={{ width: 140, padding: 10 }}
            >
              حفظ
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: 0 }}>أ) بيانات النشاط</h3>
          <div style={{ marginTop: 8 }}>
            <div className="label">اسم النشاط / المتجر *</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!(activInfo && activInfo.deviceId && activInfo.deviceId === getTrader()?.id)} />
          </div>

          <div style={{ marginTop: 8 }}>
            <div className="label">نوع النشاط (اختياري)</div>
            <input className="input" value={type} onChange={(e) => setType(e.target.value)} placeholder="مثال: بقالة / جملة" disabled={!(activInfo && activInfo.deviceId && activInfo.deviceId === getTrader()?.id)} />
          </div>

          <div style={{ marginTop: 8 }}>
            <div className="label">العنوان (اختياري)</div>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: 0 }}>ب) بيانات التواصل</h3>
          <div style={{ marginTop: 8 }}>
            <div className="label">رقم الهاتف *</div>
            <input className="input" value={phone} onChange={(e) => setPhone(toWesternDigits(e.target.value).replace(/[^0-9]/g, ""))} disabled={!(activInfo && activInfo.deviceId && activInfo.deviceId === getTrader()?.id)} />
          </div>

          <div style={{ marginTop: 8 }}>
            <div className="label">البريد الإلكتروني</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }} className="p">{getTrader()?.email || 'غير محدد'}</div>
              {getTrader()?.email && !getTrader()?.emailVerified ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn" onClick={resendConfirmation} style={{ whiteSpace: 'nowrap' }} disabled={resendCooldownSec > 0}>
                    {resendCooldownSec > 0 ? `انتظر ${Math.ceil(resendCooldownSec/60)} دقيقة` : 'إعادة إرسال رابط التأكيد'}
                  </button>
                  {resendCooldownSec > 0 ? <div className="p" style={{ color: 'var(--muted)' }}>{`${Math.floor(resendCooldownSec/60)}:${String(resendCooldownSec%60).padStart(2,'0')}`}</div> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div className="label">شعار المتجر (رابط أو رفع صورة)</div>
            <input className="input" placeholder="رابط شعار أو ارفع صورة" value={logo} onChange={(e) => setLogo(e.target.value)} />
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn" type="button" onClick={triggerFile} style={{ padding: '8px 12px', width: 'auto' }}>
                {logo ? 'تعديل الشعار' : 'رفع شعار'}
              </button>
              {logo ? (
                <button className="btn ghost" type="button" onClick={deleteLogo} style={{ padding: '8px 12px', width: 'auto' }}>
                  حذف الشعار
                </button>
              ) : null}
            </div>
            {logo ? (
              <div style={{ marginTop: 8 }}>
                <img src={logo} alt="logo" style={{ height: 56, borderRadius: 8, objectFit: 'cover' }} />
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: 0 }}>د) الاشتراك</h3>
          <div style={{ marginTop: 8 }}>
            <div className="label">تاريخ انتهاء الاشتراك</div>
            <input className="input" type="date" value={expiresAt ? expiresAt.slice(0,10) : ""} onChange={(e) => setExpiresAt(e.target.value)} />
            {/* أُزيلت أزرار التمديد والإلغاء — التفعيل الآن بالسريل فقط */}
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexDirection: 'column' }}>
                  <input className="input serial" placeholder="أدخل السريل هنا" value={serial} onChange={(e) => setSerial(e.target.value)} style={{ width: '100%' }} />
                  <button className="btn" type="button" onClick={activateWithSerial} style={{ width: '100%' }}>تفعيل بالسريل</button>
                  {activInfo ? (
                    <div style={{ marginTop: 8, padding: 10, border: '1px dashed var(--muted)', borderRadius: 8 }}>
                      <div className="p" style={{ marginBottom: 6 }}><b>حالة التفعيل</b></div>
                      <div className="p">الجهاز المرتبط: {activInfo.deviceId || 'غير مربوط'}</div>
                      <div className="p">تاريخ التفعيل: {activInfo.activatedAt ? String(activInfo.activatedAt).slice(0,19).replace('T',' ') : '—'}</div>
                    </div>
                  ) : null}
            </div>
          </div>
        </div>

        {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
        {savedMsg ? <div className="note" style={{ marginTop: 12 }}>{savedMsg}</div> : null}
        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: 0 }}>ج) الأمان</h3>
          <div className="security-card">
            <div className="security-row">
              <div>
                <div className="label">قفل الوصول للدفتر (العملاء والديون)</div>
                <div className="p">{getTrader()?.pinDashboard ? 'مفعّل' : 'غير مفعل'}</div>
              </div>
              <div className="security-actions">
                {getTrader()?.pinDashboard ? (
                  <>
                    <button className="btn" onClick={() => setPin('dashboard')}>تغيير</button>
                    <button className="btn ghost" onClick={() => removePin('dashboard')}>إلغاء</button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setPin('dashboard')}>تعيين رمز</button>
                )}
              </div>
            </div>

            <div className="security-row">
              <div>
                <div className="label">قفل صفحة الإعدادات</div>
                <div className="p">{getTrader()?.pinSettings ? 'مفعّل' : 'غير مفعل'}</div>
              </div>
              <div className="security-actions">
                {getTrader()?.pinSettings ? (
                  <>
                    <button className="btn" onClick={() => setPin('settings')}>تغيير</button>
                    <button className="btn ghost" onClick={() => removePin('settings')}>إلغاء</button>
                  </>
                ) : (
                  <button className="btn" onClick={() => setPin('settings')}>تعيين رمز</button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button className="btn ghost" onClick={reset} style={{ width: 140 }}>إعادة تحميل</button>
              <button className="btn" onClick={save} style={{ width: 140 }}>حفظ</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
