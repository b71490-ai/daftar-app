import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activateLicense, verifyLicense } from "../lib/licenseApi";
import { getDeviceId } from "../lib/deviceId";
import { getTrader, saveTrader, logout } from "../store/auth";

export default function Activation() {
  const [licenseKey, setLicenseKey] = useState(localStorage.getItem("licenseKey") || "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function onActivate() {
    setMsg("");
    const key = licenseKey.trim();
    if (!key.startsWith("L1.")) {
      setMsg("السيريال غير صحيح (لازم يبدأ بـ L1.)");
      return;
    }

    setBusy(true);
    try {
      // prefer binding to the current trader id so the app recognises the activation
      const t = getTrader();
      const deviceId = t?.id || getDeviceId();

      // 1) تفعيل
      const a = await activateLicense(key, deviceId, t?.name || null);
      if (!a.ok) {
        setMsg(`فشل التفعيل: ${a.error || "UNKNOWN"}`);
        return;
      }

      // 2) تحقق بعد التفعيل
      const v = await verifyLicense(key);
      if (!v.ok) {
        setMsg(`تم التفعيل لكن التحقق فشل: ${v.error || "UNKNOWN"}`);
        return;
      }

      // حفظ محلي في trader (حتى تظهر تفاصيل الاشتراك في الواجهة)
      try {
        const trader = getTrader() || {};
        trader.serial = key;
        trader.expiresAt = v.expiresAt || trader.expiresAt;
        // store the device id used for activation (prefer trader id)
        trader.deviceId = deviceId;
        // mark plan as active (restore full system)
        trader.plan = 'active';
        if (!trader.trialStartedAt) trader.trialStartedAt = trader.trialStartedAt || null;
        // remove expiredAt marker if present
        if (trader.expiredAt) delete trader.expiredAt;
        saveTrader(trader);
        // create a local session so the user can continue without logging in again
        try { localStorage.setItem('daftar_session', JSON.stringify({ traderId: trader.id, loggedInAt: new Date().toISOString() })); } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }

      // also keep old top-level keys for backward compatibility
      localStorage.setItem("licenseKey", key);
      localStorage.setItem("licenseStatus", "active");
      localStorage.setItem("expiresAt", v.expiresAt);

      setMsg("✅ تم التفعيل بنجاح");
      nav("/dashboard");
    } catch {
      setMsg("خطأ اتصال بالسيرفر");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: 16 }}>
      <h2>تفعيل الاشتراك</h2>

      <label style={{ display: "block", marginBottom: 8 }}>أدخل السيريال</label>
      <textarea
        value={licenseKey}
        onChange={(e) => setLicenseKey(e.target.value)}
        rows={4}
        style={{ width: "100%", padding: 12, fontSize: 14 }}
        placeholder="L1...."
      />

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button
          onClick={onActivate}
          disabled={busy}
          style={{ padding: "10px 14px", cursor: "pointer" }}
        >
          {busy ? "جار التفعيل..." : "تفعيل"}
        </button>
        <button
          onClick={() => { logout(); nav('/'); }}
          style={{ padding: "10px 14px", cursor: "pointer", background: '#ff5c5c', color: '#fff', border: 'none', borderRadius: 6 }}
        >
          خروج
        </button>
      </div>

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}