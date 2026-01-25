import { useState, useEffect } from 'react';

export default function ResetPassword() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const t = q.get('token');
      if (t) setToken(t);
    } catch (e) { }
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    setErr('');
    if (!token) return setErr('رمز غير صالح');
    if (!password || password.length < 4) return setErr('أدخل كلمة مرور جديدة (4 أحرف على الأقل)');
    try {
      const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(b && b.message ? b.message : (b.error || 'حدث خطأ')); return; }
      setOk(true);
    } catch (e) { setErr('حدث خطأ أثناء إعادة التعيين'); }
  };

  return (
    <div className="container" dir="rtl">
      <div className="card">
        <h2>إعادة تعيين كلمة المرور</h2>
        {ok ? (
          <div>
            <div className="note">تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.</div>
            <div style={{ height: 12 }} />
            <a href="/">العودة إلى صفحة تسجيل الدخول</a>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            <div>
              <div className="label">الرمز</div>
              <input className="input" value={token} onChange={e => setToken(e.target.value)} />
            </div>
            <div>
              <div className="label">كلمة المرور الجديدة</div>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            {err ? <div className="err">{err}</div> : null}
            <div style={{ height: 12 }} />
            <button className="btn">تغيير كلمة المرور</button>
          </form>
        )}
      </div>
    </div>
  );
}
