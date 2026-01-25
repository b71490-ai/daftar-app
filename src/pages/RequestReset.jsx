import { useState } from 'react';

export default function RequestReset() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    setErr('');
    try {
      const res = await fetch('/api/request-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(b && b.message ? b.message : (b.error || 'حدث خطأ'));
        return;
      }
      setOk(true);
    } catch (e) { setErr('حدث خطأ أثناء الإرسال'); }
  };

  return (
    <div className="container" dir="rtl">
      <div className="card">
        <h2>طلب استعادة كلمة المرور</h2>
        <p>أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة التعيين.</p>
        <form onSubmit={submit} className="form">
          <div>
            <div className="label">البريد الإلكتروني</div>
            <input className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@domain.com" />
          </div>
          {err ? <div className="err">{err}</div> : null}
          {ok ? <div className="note">تم إرسال رابط لإعادة التعيين إذا كان البريد مسجلاً.</div> : null}
          <div style={{ height: 12 }} />
          <button className="btn" disabled={!email}>إرسال</button>
        </form>
      </div>
    </div>
  );
}
