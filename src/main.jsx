import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { register } from './registerServiceWorker';

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA
if (import.meta.env.PROD) {
  register();
}

// Enable anti-copy protections in the web UI
try {
  import('./antiCopy').then(m => { if (m && typeof m.enableAntiCopy === 'function') m.enableAntiCopy(); }).catch(()=>{});
} catch (e) { }

// Map browser popstate and Capacitor back button to a unified `app-back` event
window.addEventListener('popstate', () => {
  try { window.dispatchEvent(new CustomEvent('app-back')); } catch (e) {}
});

// Capacitor native back button (Android)
try {
  if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNative) {
    const capPath = '@capacitor' + '/app';
    import(capPath).then(mod => {
      try {
        if (mod && mod.App && typeof mod.App.addListener === 'function') {
          mod.App.addListener('backButton', () => { try { window.dispatchEvent(new CustomEvent('app-back')); } catch (e){} });
        }
      } catch (e) { }
    }).catch(()=>{});
  }
} catch (e) { }