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
import ErrorBoundary from './components/ErrorBoundary';
import TrialCountdown from './components/TrialCountdown';
import Activation from "./pages/Activation";
import RequireLicense from "./components/RequireLicense";
import AdminLicenses from "./pages/AdminLicenses";
import AdminActivity from "./pages/AdminActivity";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTraders from "./pages/AdminTraders"; // New import added
import Backups from "./pages/Backups";
import RequestReset from "./pages/RequestReset";
import ResetPassword from "./pages/ResetPassword";
import Toast from './components/Toast';

function MainApp() {
  const [authView, setAuthView] = useState('register'); // when no trader: 'register' | 'login'
  const [trader, setTrader] = useState(null);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard"); // dashboard | customers | debts | statement
  const [statementCustomerId, setStatementCustomerId] = useState(null);
  const [trialWarning, setTrialWarning] = useState(null); // { days }
  const isAdmin = (trader && String(trader.role || '').toUpperCase() === 'ADMIN');

  const refresh = () => {
    const t = getTrader();
    setTrader(t);
    setSession(getSession());

    // Auto-create session for admin so admin stays signed in across reloads
    // This only runs when trader data still exists in localStorage. Explicit
    // logout clears the trader record, preventing re-creation.
    try {
      const s = getSession();
      if (!s && t && String(t.role || '').toUpperCase() === 'ADMIN') {
        const ns = { traderId: t.id, loggedInAt: new Date().toISOString() };
        try { localStorage.setItem('daftar_session', JSON.stringify(ns)); } catch (e) { }
        setSession(ns);
      }
    } catch (e) { }

    // compute trial warning days (show when 1..3 days left)
    try {
      setTrialWarning(null);
      // enforce expiry: mark expired and block usage without deleting data
      try {
        const { enforceExpiry } = require('./store/auth');
        const didExpire = enforceExpiry();
        if (didExpire) {
          setPage('subscriptionExpired');
          return;
        }
      } catch (e) { /* ignore require errors */ }

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
      // lightweight prompt for unverified email: show once per session
      try {
        const s = getSession();
        if (t && s && !t.emailVerified && !s.emailConfirmToastShown) {
          window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'يرجى تأكيد بريدك الإلكتروني لحماية حسابك — يمكنك إعادة إرسال رابط التأكيد من الإعدادات.', type: 'info' } }));
          s.emailConfirmToastShown = true;
          localStorage.setItem('daftar_session', JSON.stringify(s));
          setSession(s);
        }
      } catch (e) { /* ignore */ }
    } catch { /* ignore */ }
  };

  // Verify license with backend when app refreshes (if trader has a serial)
  useEffect(() => {
    const verifyLicense = async () => {
      const t = getTrader();
      if (!t || !t.serial) return;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/license/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: t.serial }),
        });
        const body = await res.json().catch(() => ({}));

        // Successful verification -> update local trader record
        if (res.ok && body.ok) {
          const updated = { ...t, plan: body.plan || t.plan, deviceId: body.boundDeviceId || t.deviceId, activatedAt: body.activatedAt || t.activatedAt, expiresAt: body.expiresAt || t.expiresAt, lastVerifiedAt: new Date().toISOString() };
          localStorage.setItem('daftar_trader', JSON.stringify(updated));
          // ensure licenseStatus is active after successful verification
          localStorage.setItem('licenseStatus', 'active');
          setTrader(updated);

          // if we were showing the expired page and there's an active session, restore to dashboard
          try {
            if (page === 'subscriptionExpired' && session) {
              setPage('dashboard');
            }
          } catch (e) { /* ignore */ }

          return;
        }

        // If server responds with blocked/expired (or 403), treat subscription as ended
        const err = (body && body.error) || '';
        if (res.status === 403 || err === 'BLOCKED' || err === 'EXPIRED') {
          try {
            // mark locally as expired/blocked and set licenseStatus
            const expired = { ...t, expiresAt: new Date().toISOString() };
            localStorage.setItem('daftar_trader', JSON.stringify(expired));
            localStorage.setItem('licenseStatus', 'blocked');
            setTrader(expired);

            // notify user and force logout to clear session
            try { window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'انتباه: تم إيقاف هذا السيريال أو انتهت صلاحيته. تم تسجيل الخروج.', type: 'error' } })); } catch (e) { /* ignore */ }
            logout();
            refresh();

            // show subscription expired page
            setPage('subscriptionExpired');
          } catch (e) { /* ignore */ }
          return;
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

  // Initialize trial on first run (if trader exists but no session and no expiresAt)
  useEffect(() => {
    try {
      const t = getTrader();
      const s = getSession();
      if (t && !s && !t.expiresAt) {
        const now = new Date();
        t.trialStartedAt = now.toISOString();
        t.expiresAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
        localStorage.setItem('daftar_trader', JSON.stringify(t));
        // refresh local state
        refresh();
      }
    } catch (e) { /* ignore */ }
  // run once on mount
  }, []);

  // Allow explicitly showing the Register view when requested (e.g. user clicks
  // "إنشاء حساب جديد") even if a trader exists but there is no active session.
  if (!session && authView === 'register') {
    return <Register onGoToLogin={() => setAuthView('login')} />;
  }

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
          onGoToRegister={() => {
            console.log('App: onGoToRegister called (from no-trader login)');
            setAuthView('register');
          }}
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
        onGoToRegister={() => {
          console.log('App: onGoToRegister called (from no-session login)');
          setAuthView('register');
        }}
      />
    );

  // 3) صفحات بعد الدخول
  if (page === "customers") {
    return (
      <>
        {isAdmin ? (
          <div className="trial-banner">حساب إداري كامل</div>
        ) : (trialWarning ? (
          <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
        ) : null)}
        <TrialCountdown />
        <Customers onBack={() => setPage("dashboard")} />
      </>
    );
  }

  if (page === "debts") {
    return (
      <>
        {isAdmin ? (
          <div className="trial-banner">حساب إداري كامل</div>
        ) : (trialWarning ? (
          <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
        ) : null)}
        <TrialCountdown />
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
        {isAdmin ? (
          <div className="trial-banner">حساب إداري كامل</div>
        ) : (trialWarning ? (
          <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
        ) : null)}
        <TrialCountdown />
        <Statement customerId={statementCustomerId} onBack={() => setPage("debts")} />
      </>
    );
  }

  if (page === "settings") {
    return (
      <>
        {isAdmin ? (
          <div className="trial-banner">حساب إداري كامل</div>
        ) : (trialWarning ? (
          <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
        ) : null)}
        <TrialCountdown />
        <Settings onBack={() => setPage("dashboard")} onSaved={() => { refresh(); }} />
      </>
    );
  }

  if (page === "subscriptionExpired") {
    return <SubscriptionExpired onBack={() => { /* go to settings to edit subscription or logout */ setPage('settings'); }} onLogout={() => { logout(); refresh(); setPage('dashboard'); }} />;
  }

  return (
    <>
      <Toast />
      {isAdmin ? (
        <div className="trial-banner">حساب إداري كامل</div>
      ) : (trialWarning ? (
        <div className="trial-banner">⏰ تبقّى {trialWarning.days} {trialWarning.days === 1 ? 'يوم' : trialWarning.days === 2 ? 'يومان' : 'أيام'} على انتهاء التجربة</div>
      ) : null)}
      <TrialCountdown />
      <RequireLicense>
        <Dashboard
          traderName={trader.name}
          onOpenCustomers={() => {
        const t = getTrader();
        // require activation to open customers OR allow during active trial
        try {
          const now = new Date();
          const activated = t && t.deviceId && t.deviceId === t.id && t.expiresAt && new Date(t.expiresAt) > now;
          const inTrial = t && t.plan === 'trial' && t.expiresAt && new Date(t.expiresAt) > now;
          if (!activated && !inTrial) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'التفعيل مطلوب لفتح سجلات العملاء.', type: 'error' } }));
        } catch { /* ignore */ }
        if (t?.pinDashboard) {
          const attempt = prompt('أدخل رمز الوصول للدفتر:');
          if (String(attempt) !== String(t.pinDashboard)) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'رمز خاطئ', type: 'error' } }));
        }
        setPage("customers");
      }}
      onOpenDebts={() => {
        const t = getTrader();
        // require activation to open debts OR allow during active trial
        try {
          const now = new Date();
          const activated = t && t.deviceId && t.deviceId === t.id && t.expiresAt && new Date(t.expiresAt) > now;
          const inTrial = t && t.plan === 'trial' && t.expiresAt && new Date(t.expiresAt) > now;
          if (!activated && !inTrial) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'التفعيل مطلوب لفتح الدفاتر.', type: 'error' } }));
        } catch { /* ignore */ }
        if (t?.pinDashboard) {
          const attempt = prompt('أدخل رمز الوصول للدفتر:');
          if (String(attempt) !== String(t.pinDashboard)) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'رمز خاطئ', type: 'error' } }));
        }
        setPage("debts");
      }}
      onOpenSettings={() => {
        const t = getTrader();
        if (t?.pinSettings) {
          const attempt = prompt('أدخل رمز الوصول للإعدادات:');
          if (String(attempt) !== String(t.pinSettings)) return window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'رمز خاطئ', type: 'error' } }));
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
    { path: "/request-reset", element: <RequestReset /> },
    { path: "/reset-password", element: <ResetPassword /> },
    { path: "/admin/dashboard", element: <AdminDashboard /> },
    { path: "/admin/licenses", element: <AdminLicenses /> },
    { path: "/admin/traders", element: <AdminTraders /> },
    { path: "/admin/activity", element: <AdminActivity /> },
      { path: "/admin/backups", element: <Backups /> },
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

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
