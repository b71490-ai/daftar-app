import { useMemo, useState } from "react";
import { login } from "../store/auth";

export default function Login({ onLoggedIn, onGoToRegister }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const canSubmit = useMemo(() => {
    return phone.trim().length >= 6 && password.length >= 4;
  }, [phone, password]);

  const submit = (e) => {
    e.preventDefault();
    setErr("");

    const res = login(phone, password);
    if (!res.ok) {
      setErr(res.msg);
      return;
    }
    onLoggedIn?.(res.trader);
  };

  return (
    <div className="container" dir="rtl">
      <div className="card">
        <div className="brand">
          <div className="logo" />
          <div>
            <h1 className="h1">تسجيل الدخول</h1>
            <p className="p">ادخل رقم الجوال وكلمة المرور للمتابعة.</p>
          </div>
        </div>

        <form className="form" onSubmit={submit}>
          <div>
            <div className="label">رقم الجوال</div>
            <input
              className="input"
              placeholder="مثال: 777123456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />
          </div>

          <div>
            <div className="label">كلمة المرور</div>
            <input
              className="input"
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {err ? <div className="err">{err}</div> : null}

          <button className="btn" disabled={!canSubmit} style={{ opacity: canSubmit ? 1 : 0.7 }}>
            دخول
          </button>

          <div style={{ height: 12 }} />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (typeof onGoToRegister === 'function') onGoToRegister();
              else window.location.reload();
            }}
          >
            إنشاء حساب جديد
          </button>

          <div className="note">
            إذا نسيت كلمة المرور — مؤقتًا نعملها لاحقًا (نسخة تجريبية).
          </div>
        </form>
      </div>
    </div>
  );
}