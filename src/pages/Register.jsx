import { useMemo, useState, useRef } from "react";

export default function Register({ onGoToLogin }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingResend, setLoadingResend] = useState(false);
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const canSubmit = useMemo(() => {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    return name.trim().length >= 2 && phone.trim().length >= 6 && password.length >= 4 && emailOk;
  }, [name, phone, password]);

  const submit = (e) => {
    e.preventDefault();
    console.log('Register.submit called', { name, phone, password, canSubmit });
    setErr("");

    // validate email specifically
    if (!email.trim()) {
      setErr('حقل البريد الإلكتروني مطلوب.');
      emailRef?.current?.focus?.();
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      setErr('يرجى إدخال بريد إلكتروني صحيح');
      emailRef?.current?.focus?.();
      return;
    }

    if (!canSubmit) {
      setErr("تأكد من إدخال الاسم ورقم الجوال وكلمة مرور صحيحة.");
      return;
    }

    (async () => {
      try {
        const payload = { id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : ('id-' + Math.random().toString(36).slice(2, 10)), name: name.trim(), phone: phone.trim(), email: email.trim(), password };
        const res = await fetch((window.__env && window.__env.API_URL) ? `${window.__env.API_URL.replace(/\/$/, '')}/api/register-trader` : '/api/register-trader', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = body && body.message ? body.message : (body.error || 'حدث خطأ أثناء التسجيل');
          setErr(msg);
          return;
        }
        const trader = body.trader || payload;
        try { localStorage.setItem('daftar_trader', JSON.stringify(trader)); } catch (e) { }
        setSuccess('تم إنشاء الحساب بنجاح ✅ يمكنك الآن تسجيل الدخول');
        setTimeout(() => {
          try {
            if (typeof onGoToLogin === 'function') onGoToLogin();
            else window.location.href = '/';
          } catch (e) { window.location.reload(); }
        }, 900);
      } catch (err) {
        console.error('Register.submit error', err);
        setErr('حدث خطأ أثناء إنشاء الحساب. حاول مرة أخرى.');
      }
    })();
  };

  return (
    <div className="container" dir="rtl">
      <div className="card">
        <div className="brand">
          <div className="logo" />
          <div>
            <h1 className="h1">دفتر — نظام الديون</h1>
            <p className="p">سجّل كتاجر وابدأ إدارة العملاء والديون بسهولة.</p>
          </div>
        </div>

        <form className="form" onSubmit={submit}>
          <div>
            <div className="label">اسم التاجر</div>
              <input
                className="input"
                placeholder="مثال: متجر الأمانة"
                value={name}
                ref={nameRef}
                onChange={(e) => setName(e.target.value)}
              />
          </div>

          <div>
            <div className="label">رقم الجوال</div>
            <input
              className="input"
              placeholder="مثال: 777123456"
              value={phone}
              ref={phoneRef}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />
          </div>

          <div>
            <div className="label">البريد الإلكتروني</div>
            <input
              className="input"
              placeholder="example@domain.com"
              value={email}
              ref={emailRef}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
            />
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f7f9fb', padding: '6px 10px', borderRadius: 8 }}>
                <div style={{ fontSize: 16, opacity: 0.9, marginLeft: 6 }}>ℹ️</div>
                <div style={{ color: '#4b5563', fontSize: 13, lineHeight: 1.2 }}>سيتم استخدام البريد الإلكتروني لاستعادة كلمة المرور عند نسيانها</div>
              </div>
            </div>
          </div>

          <div>
            <div className="label">كلمة المرور</div>
            <input
              className="input"
              type="password"
              placeholder="4 أحرف على الأقل"
              value={password}
              ref={passwordRef}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {err ? <div className="err">{err}</div> : null}
          {success ? <div className="note">{success}</div> : null}
            {success && (function() {
              try {
                const stored = localStorage.getItem('daftar_trader');
                const t = stored ? JSON.parse(stored) : null;
                if (t && t.email && !t.emailVerified) {
                  return (
                    <div style={{ marginTop: 10 }}>
                      <button className="btn btn-ghost" disabled={loadingResend} onClick={async () => {
                        try {
                          setLoadingResend(true);
                          const res = await fetch('/api/resend-confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traderId: t.id }) });
                          const b = await res.json().catch(()=>({}));
                          if (!res.ok) {
                            window.dispatchEvent(new CustomEvent('app-toast',{detail:{message: b.message || b.error || 'فشل الإرسال', type:'error'}}));
                          } else {
                            window.dispatchEvent(new CustomEvent('app-toast',{detail:{message: 'تم إرسال رابط تأكيد جديد إلى بريدك.', type:'success'}}));
                          }
                        } catch (e) { window.dispatchEvent(new CustomEvent('app-toast',{detail:{message: 'فشل الإرسال', type:'error'}})); }
                        finally { setLoadingResend(false); }
                      }}>إعادة إرسال رابط التأكيد</button>
                    </div>
                  );
                }
              } catch (e) { }
              return null;
            })()}

          <button
            type="submit"
            className="btn"
            style={{ opacity: canSubmit ? 1 : 0.7 }}
            onClick={() => {
              if (!canSubmit) {
                setErr('تأكد من إدخال الاسم ورقم الجوال وكلمة مرور صحيحة.');
                if (name.trim().length < 2) nameRef?.current?.focus?.();
                else if (phone.trim().length < 6) phoneRef?.current?.focus?.();
                else passwordRef?.current?.focus?.();
              }
            }}
          >
            إنشاء الحساب
          </button>

          <div style={{ height: 12 }} />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              console.log('Register: go to login clicked');
              if (typeof onGoToLogin === 'function') onGoToLogin();
              else window.location.reload();
            }}
          >
            تسجيل الدخول
          </button>

          <div className="note">
            بالتسجيل ستؤسَّس حسابك؛ ستبدأ <b>التجربة المجانية 10 أيام</b> عند أول تسجيل دخول أو أول تشغيل للنظام.
          </div>
        </form>
      </div>
    </div>
  );
}