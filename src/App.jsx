import { useEffect, useState } from "react";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Debts from "./pages/Debts";
import Statement from "./pages/Statement";
import Settings from "./pages/Settings";
import SubscriptionExpired from "./pages/SubscriptionExpired";
import { getSession, getTrader, logout } from "./store/auth";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Activation from "./pages/Activation";
import RequireLicense from "./components/RequireLicense";

function MainApp() {
  const [authView, setAuthView] = useState('register'); // when no trader: 'register' | 'login'
  const [trader, setTrader] = useState(null);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard"); // dashboard | customers | debts | statement
  const [statementCustomerId, setStatementCustomerId] = useState(null);
  const [trialWarning, setTrialWarning] = useState(null); // { days }

  const refresh = () => {
    const t = getTrader();
    setTrader(t);
    setSession(getSession());

    // compute trial warning days (show when 1..3 days left)
    try {
      setTrialWarning(null);
      if (t && t.expiresAt) {
        const now = new Date();
        const exp = new Date(t.expiresAt);
        const diff = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
        if (diff <= 0) {
          setPage("subscriptionExpired");
        } else if (diff <= 3) {
          setTrialWarning({ days: diff });
        }
      }
    } catch { /* ignore */ }
  };

  // Verify license with backend when app refreshes (if trader has a serial)
  useEffect(() => {
    const verifyLicense = async () => {
      const t = getTrader();
      if (!t || !t.serial) return;
      try {
        const res = await fetch('http://localhost:4000/api/license/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: t.serial }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          const updated = { ...t, plan: body.plan || t.plan, deviceId: body.boundDeviceId || t.deviceId, activatedAt: body.activatedAt || t.activatedAt, expiresAt: body.expiresAt || t.expiresAt, lastVerifiedAt: new Date().toISOString() };
          localStorage.setItem('daftar_trader', JSON.stringify(updated));
          setTrader(updated);
        }
      } catch { /* ignore */ }
      // ignore (offline allowed for short period)
    };

    verifyLicense();

    const iv = setInterval(() => {
      if (navigator.onLine) verifyLicense();
    }, 6 * 60 * 60 * 1000); // every 6 hours

    window.addEventListener('online', verifyLicense);
    return () => { clearInterval(iv); window.removeEventListener('online', verifyLicense); };
  // run when component mounts
  }, []);

  useEffect(() => {
    refresh();
  }, []);

  // 1) لا يوجد حساب
  if (!trader) {
    if (authView === 'login') {
      return (
        <Login
          onLoggedIn={(trader) => {
            refresh();
            try {
              if (trader && trader.expiresAt && new Date() > new Date(trader.expiresAt)) {
                setPage("subscriptionExpired");
                return;
              }
            } catch { /* ignore */ }
            setPage("customers");
          }}
          onGoToRegister={() => setAuthView('register')}
        />
      );
    }

    return <Register onGoToLogin={() => setAuthView('login')} />;
  }

  // 2) يوجد حساب لكن لا توجد جلسة
  if (!session)
    return (
      <Login
        onLoggedIn={(trader) => {
          refresh();
          try {
            if (trader && trader.expiresAt && new Date() > new Date(trader.expiresAt)) {
              setPage("subscriptionExpired");
              return;
            }
          } catch { /* ignore */ }
          setPage("customers");
        }}
        onGoToRegister={() => setAuthView('register')}
      />
    );

  // 3) صفحات بعد الدخول
  if (page === "customers") {
    return (
      <>
        {trialWarning ? (
          <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
        ) : null}
        <Customers onBack={() => setPage("dashboard")} />
      </>
    );
  }

  if (page === "debts") {
    return (
      <>
        {trialWarning ? (
          <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
        ) : null}
        <Debts
          onBack={() => setPage("dashboard")}
          onOpenStatement={(id) => {
            setStatementCustomerId(id);
            setPage("statement");
          }}
        />
      </>
    );
  }

  if (page === "statement") {
    return (
      <>
        {trialWarning ? (
          <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
        ) : null}
        <Statement customerId={statementCustomerId} onBack={() => setPage("debts")} />
      </>
    );
  }

  if (page === "settings") {
    return (
      <>
        {trialWarning ? (
          <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
        ) : null}
        <Settings onBack={() => setPage("dashboard")} onSaved={() => { refresh(); }} />
      </>
    );
  }

  if (page === "subscriptionExpired") {
    return <SubscriptionExpired onBack={() => { /* go to settings to edit subscription or logout */ setPage('settings'); }} onLogout={() => { logout(); refresh(); setPage('dashboard'); }} />;
  }

  return (
    <>
      {trialWarning ? (
        <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
      ) : null}
      <RequireLicense>
        <Dashboard
          traderName={trader.name}
          onOpenCustomers={() => {
        const t = getTrader();
        // require activation to open customers
        try {
          const now = new Date();
          const activated = t && t.deviceId && t.deviceId === t.id && t.expiresAt && new Date(t.expiresAt) > now;
          if (!activated) return alert('التفعيل مطلوب لفتح سجلات العملاء.');
        } catch { /* ignore */ }
        if (t?.pinDashboard) {
          const attempt = prompt('أدخل رمز الوصول للدفتر:');
          if (String(attempt) !== String(t.pinDashboard)) return alert('رمز خاطئ');
        }
        setPage("customers");
      }}
      onOpenDebts={() => {
        const t = getTrader();
        // require activation to open debts
        try {
          const now = new Date();
          const activated = t && t.deviceId && t.deviceId === t.id && t.expiresAt && new Date(t.expiresAt) > now;
          if (!activated) return alert('التفعيل مطلوب لفتح الدفاتر.');
        } catch { /* ignore */ }
        if (t?.pinDashboard) {
          const attempt = prompt('أدخل رمز الوصول للدفتر:');
          if (String(attempt) !== String(t.pinDashboard)) return alert('رمز خاطئ');
        }
        setPage("debts");
      }}
      onOpenSettings={() => {
        const t = getTrader();
        if (t?.pinSettings) {
          const attempt = prompt('أدخل رمز الوصول للإعدادات:');
          if (String(attempt) !== String(t.pinSettings)) return alert('رمز خاطئ');
        }
        setPage("settings");
      }}
      onLogout={() => {
        logout();
        refresh();
        setPage("dashboard");
      }}
        />
      </RequireLicense>
    </>
  );
}

export default function App() {
  const routes = [
    { path: "/activate", element: <Activation /> },
    { path: "/*", element: <MainApp /> },
  ];

  const router = createBrowserRouter(routes, {
    future: { v7_startTransition: true },
  });

  // Suppress noisy React Router future-flag warning in dev console
  // The project already opts into v7_startTransition above; this just hides
  // the duplicate runtime warning in development to keep console clean.
  if (typeof window !== 'undefined' && import.meta?.env?.DEV) {
    const _warn = console.warn;
    console.warn = (...args) => {
      try {
        const m = String(args[0] || '');
        if (m.includes('Future Flag Warning') && m.includes('v7_startTransition')) return;
      } catch {}
      _warn.apply(console, args);
    };
  }

  return <RouterProvider router={router} />;
}
