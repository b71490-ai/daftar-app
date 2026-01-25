import { useMemo, useState } from "react";
import { login } from "../store/auth";

export default function Login({ onLoggedIn, onGoToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const canSubmit = useMemo(() => {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    return emailOk && password.length >= 4;
  }, [email, password]);
  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    const res = await login(email.trim(), password);
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
            <div className="label">البريد الإلكتروني</div>
            <input
              className="input"
              placeholder="example@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
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

          <div style={{ height: 8 }} />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { window.location.href = '/request-reset'; }}
          >
            نسيت كلمة المرور
          </button>

          <div style={{ height: 12 }} />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              console.log('Login: create account clicked');
              try {
                if (typeof onGoToRegister === 'function') onGoToRegister();
                else window.location.reload();
              } catch (err) {
                console.error('Login: onGoToRegister error', err);
              }
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