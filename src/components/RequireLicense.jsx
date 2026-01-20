import { Navigate } from "react-router-dom";

export default function RequireLicense({ children }) {
  const key = localStorage.getItem("licenseKey");
  const status = localStorage.getItem("licenseStatus");
  const expiresAt = localStorage.getItem("expiresAt");

  if (!key || status !== "active") return <Navigate to="/activate" replace />;

  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (exp <= new Date()) return <Navigate to="/subscription-expired" replace />;
  }

  return children;
}