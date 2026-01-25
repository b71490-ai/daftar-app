import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ErrorPage() {
  const nav = useNavigate();
  return (
    <div style={{ padding: 24 }}>
      <h2>عفوًا، حدث خطأ</h2>
      <p>عفواً، حدث خطأ غير متوقع. يرجى المحاولة لاحقًا أو التواصل مع الدعم.</p>
      <div style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => nav('/')}>العودة للرئيسية</button>
      </div>
    </div>
  );
}
