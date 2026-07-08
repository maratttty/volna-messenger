import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';

// Delete the old 'supabase-storage' runtime cache that was previously created
// by the CacheFirst workbox strategy. It incorrectly handled Safari iOS range
// requests, causing ~30-second delays before audio/video playback started.
// Safe to call even if the cache doesn't exist.
if ('caches' in window) {
  void caches.delete('supabase-storage');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
