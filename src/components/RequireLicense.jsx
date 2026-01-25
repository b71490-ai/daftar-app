import { Navigate } from "react-router-dom";

export default function RequireLicense({ children }) {
  try {
    // Allow when there is an active license
    const key = localStorage.getItem("licenseKey");
    const status = localStorage.getItem("licenseStatus");
    const expiresAtTop = localStorage.getItem("expiresAt");

    if (key && status === "active") {
      if (expiresAtTop) {
        const exp = new Date(expiresAtTop);
        if (exp <= new Date()) return <Navigate to="/subscription-expired" replace />;
      }
      return children;
    }

    // Fallback: allow full access during local trial recorded on trader object
    const traderRaw = localStorage.getItem('daftar_trader');
    if (traderRaw) {
      try {
        const trader = JSON.parse(traderRaw);
        // Admin accounts bypass license checks
        if (trader && String(trader.role || '').toUpperCase() === 'ADMIN') return children;
        if (trader && trader.expiresAt) {
          const exp = new Date(trader.expiresAt);
          if (exp > new Date()) {
            // trial or active subscription present
            return children;
          }
          return <Navigate to="/subscription-expired" replace />;
        }
      } catch (e) { /* ignore parse errors */ }
    }

    return <Navigate to="/activate" replace />;
  } catch (e) {
    return <Navigate to="/activate" replace />;
  }
}