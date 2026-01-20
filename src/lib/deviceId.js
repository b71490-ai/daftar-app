const KEY = "deviceId";

function randomId() {
  // معرف بسيط ثابت للجهاز (للـdev)
  return "DEV-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export function getDeviceId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(KEY, id);
  }
  return id;
}