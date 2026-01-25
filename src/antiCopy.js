export function enableAntiCopy(){
  try {
    // Disable copy and context menu
    window.addEventListener('copy', (e) => { e.preventDefault(); try { window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'النسخ معطّل', type: 'info' } })); } catch{} });
    window.addEventListener('cut', (e) => { e.preventDefault(); });
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    window.addEventListener('selectstart', (e) => {
      const tgt = e.target || e.srcElement;
      // allow selection inside inputs and textareas
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      e.preventDefault();
    });
    window.addEventListener('keydown', (e) => {
      // block Ctrl/Cmd+C, Ctrl/Cmd+X, Ctrl/Cmd+U, Ctrl/Cmd+S
      if ((e.ctrlKey || e.metaKey) && ['c','x','u','s'].includes((e.key || '').toLowerCase())) {
        e.preventDefault();
        try { window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'الإجراءات المحمية لا تعمل في هذا الوضع', type: 'info' } })); } catch {}
      }
    });
  } catch (e) { /* ignore */ }
}
