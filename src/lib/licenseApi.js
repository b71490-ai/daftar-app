const API_BASE = "https://daftar-app.onrender.com";

export async function verifyLicense(licenseKey) {
  const r = await fetch(`${API_BASE}/api/license/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey }),
  });
  return r.json();
}

export async function activateLicense(licenseKey, deviceId, customerName) {
  const r = await fetch(`${API_BASE}/api/license/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey, deviceId, customerName }),
  });
  return r.json();
}