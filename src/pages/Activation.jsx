import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activateLicense, verifyLicense } from "../lib/licenseApi";
import { getDeviceId } from "../lib/deviceId";

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
      const deviceId = getDeviceId();

      // 1) تفعيل
      const a = await activateLicense(key, deviceId);
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

      // حفظ محلي
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

      <button
        onClick={onActivate}
        disabled={busy}
        style={{ marginTop: 12, padding: "10px 14px", cursor: "pointer" }}
      >
        {busy ? "جار التفعيل..." : "تفعيل"}
      </button>

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}