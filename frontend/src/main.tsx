import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { QueryProvider } from './utils/QueryProvider'
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
            init.headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return originalFetch.call(this, input, init);
};
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(this: XMLHttpRequest & { _url?: string | URL }, method: string, url: string | URL) {
    this._url = url;
    return originalOpen.call(this, method, url, true);
} as any;
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(this: XMLHttpRequest & { _url?: string | URL }, body?: Document | XMLHttpRequestBodyInit | null) {
    const token = localStorage.getItem('periscope_token');
    const isApiUrl = typeof this._url === 'string' && (this._url.startsWith('/api') || this._url.startsWith('api') || !this._url.includes('://'));
    if (token && isApiUrl) {
        this.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    return originalSend.call(this, body);
};
const OriginalWebSocket = window.WebSocket;
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
} as any;
(window.WebSocket as any).prototype = OriginalWebSocket.prototype;
Object.keys(OriginalWebSocket).forEach((key) => {
  (window.WebSocket as any)[key] = (OriginalWebSocket as any)[key];
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
)
