const API_BASE = "http://localhost:4000";

export async function verifyLicense(licenseKey) {
  const r = await fetch(`${API_BASE}/api/license/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey }),
  });
  return r.json();
}

export async function activateLicense(licenseKey, deviceId) {
  const r = await fetch(`${API_BASE}/api/license/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey, deviceId }),
  });
  return r.json();
}