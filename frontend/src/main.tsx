import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GlobalProvider } from './context/GlobalContext'

// FORCE UNREGISTER ALL SERVICE WORKERS & CLEAR CACHE TO FIX STUCK PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
    }
  });
  if (window.caches) {
    caches.keys().then((names) => {
      for (let name of names) caches.delete(name);
    });
  }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalProvider>
      <App />
    </GlobalProvider>
  </StrictMode>,
)
