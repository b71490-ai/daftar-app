import React from "react";
import { getTrader } from "../store/auth";

export default function SubscriptionExpired({ onBack, onLogout }) {
  const trader = getTrader();
  const name = trader?.name || "—";
  const exp = trader?.expiresAt ? new Date(trader.expiresAt).toLocaleDateString() : "—";

  return (
    <div className="container" dir="rtl">
      <div className="card" style={{ maxWidth: 680 }}>
        <div className="brand">
          <div className="logo" />
          <div>
            <h1 className="h1">⛔ الاشتراك منتهي</h1>
            <p className="p">انتهت الفترة التجريبية الخاصة بك. يرجى تجديد الاشتراك للاستمرار.</p>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{name}</div>
          <div style={{ color: 'var(--muted)', marginTop: 6 }}>تاريخ انتهاء الاشتراك: <b>{exp}</b></div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={onBack} style={{ minWidth: 160 }}>
            تعديل الاشتراك
          </button>

          <button
            className="btn"
            onClick={() => {
              const phone = trader?.phone;
              const msg = `مرحبًا، اشتراكي منتهي وأرغب بالتجديد\nاسم النشاط: ${name}`;
              if (!phone) {
                try { navigator.clipboard?.writeText(msg); } catch { /* ignore */ }
                return alert('لم يتم ضبط رقم التواصل لديك. تم نسخ نص الرسالة، ضع رقمك في الإعدادات أو أرسل الرسالة يدويًا.');
              }
              const to = String(phone).replace(/[^0-9]/g, "");
              const url = `https://wa.me/${to}?text=${encodeURIComponent(msg)}`;
              const w = window.open(url, '_blank');
              if (!w) {
                // popup blocked — copy text and notify
                try { navigator.clipboard?.writeText(msg); alert('تعذّر فتح واتساب تلقائيًا. تم نسخ نص الرسالة، ألصقه في محادثة واتساب مع رقمك.'); } catch { alert('تعذّر فتح واتساب — الرجاء إرسال رسالة التجديد يدويًا.'); }
              }
            }}
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,.95), rgba(16,185,129,.85))', minWidth: 220 }}
          >
            📞 تواصل لتجديد الاشتراك
          </button>

          <button className="btn ghost" onClick={onLogout} style={{ minWidth: 160 }}>
            تسجيل خروج
          </button>
        </div>

        <div style={{ marginTop: 14 }} className="note">
          يمكنك تحديث بيانات الاشتراك من صفحة الإعدادات أو التواصل مع الدعم لتمديد الفترة.
        </div>
      </div>
    </div>
  );
}
