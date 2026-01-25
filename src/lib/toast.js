export function showToast(message, type = 'info') {
  try {
    const ev = new CustomEvent('app-toast', { detail: { message, type } });
    window.dispatchEvent(ev);
  } catch (e) { console.log('toast fallback:', message); }
}
