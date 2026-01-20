export function getDeviceId() {
  const key = "deviceId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "DEV-" + crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
