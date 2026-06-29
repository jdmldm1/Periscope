import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { QueryProvider } from './utils/QueryProvider'

// ============================================================
// Global API & WebSocket Interceptors for Token Authentication
// ============================================================

// 1. Intercept window.fetch
const originalFetch = window.fetch;
window.fetch = function(input, init) {
    const token = localStorage.getItem('periscope_token');
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    const isApiUrl = url.startsWith('/api') || url.startsWith('api') || !url.includes('://');
    
    if (token && isApiUrl) {
        init = init || {};
        init.headers = init.headers || {};
        if (init.headers instanceof Headers) {
            init.headers.set('Authorization', `Bearer ${token}`);
        } else if (Array.isArray(init.headers)) {
            const hasAuth = init.headers.some(h => h[0].toLowerCase() === 'authorization');
            if (!hasAuth) {
                init.headers.push(['Authorization', `Bearer ${token}`]);
            }
        } else {
            // @ts-ignore
            init.headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return originalFetch.call(this, input, init);
};

const originalOpen = XMLHttpRequest.prototype.open;
// @ts-ignore
XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
    // @ts-ignore
    this._url = url;
    // @ts-ignore
    return originalOpen.apply(this, [method, url, ...args]);
} as any;

const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(...args) {
    const token = localStorage.getItem('periscope_token');
    // @ts-ignore
    const isApiUrl = typeof this._url === 'string' && (this._url.startsWith('/api') || this._url.startsWith('api') || !this._url.includes('://'));
    if (token && isApiUrl) {
        // @ts-ignore
        this.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    return originalSend.apply(this, args);
};

// 3. Intercept WebSocket connections to inject session token parameter
const OriginalWebSocket = window.WebSocket;
// @ts-ignore
window.WebSocket = function(url: string | URL, protocols?: string | string[]) {
  const urlStr = url.toString();
  if (urlStr.includes('/api/') && (urlStr.includes('/ws') || urlStr.includes('/ws?'))) {
    const token = localStorage.getItem('periscope_token');
    if (token) {
      const parsedUrl = new URL(urlStr);
      if (!parsedUrl.searchParams.has('token')) {
        parsedUrl.searchParams.set('token', token);
      }
      url = parsedUrl.toString();
    }
  }
  return new OriginalWebSocket(url, protocols);
};
// Copy prototype and static properties
window.WebSocket.prototype = OriginalWebSocket.prototype;
// @ts-ignore
Object.keys(OriginalWebSocket).forEach(key => {
  // @ts-ignore
  window.WebSocket[key] = OriginalWebSocket[key];
});

// ============================================================

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
)
