import { useMemo, useState, useRef } from "react";

export default function Register({ onGoToLogin }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && phone.trim().length >= 6 && password.length >= 4;
  }, [name, phone, password]);

  const submit = (e) => {
    e.preventDefault();
    setErr("");

    if (!canSubmit) {
      setErr("تأكد من إدخال الاسم ورقم الجوال وكلمة مرور صحيحة.");
      return;
    }

    const trader = {
      id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : ('id-' + Math.random().toString(36).slice(2, 10)),
      name: name.trim(),
      phone: phone.trim(),
      password, // لاحقًا نخزنها مشفّرة في الباك اند
      plan: "trial",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 أيام تجربة
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem("daftar_trader", JSON.stringify(trader));
    alert("تم إنشاء الحساب بنجاح ✅ سيتم تحويلك لصفحة الدخول");
    // Refresh the app so `App` picks up the new trader and shows the login page
    window.location.reload();
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

          <button
            type="submit"
            className="btn"
            style={{ opacity: canSubmit ? 1 : 0.7, pointerEvents: 'auto' }}
            onClick={(ev) => {
              if (!canSubmit) {
                ev.preventDefault();
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
            بالتسجيل أنت تبدأ <b>تجربة مجانية 7 أيام</b> — وبعدها نفعّل الاشتراك الشهري.
          </div>
        </form>
      </div>
    </div>
  );
}