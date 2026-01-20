export async function verifyLicense(licenseKey) {
  const r = await fetch("/api/license/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

export async function activateLicense(licenseKey, deviceId) {
  const r = await fetch("/api/license/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey, deviceId }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}
