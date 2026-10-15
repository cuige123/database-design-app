const CACHE_NAME = 'querypad-offline-v33';
const APP_SHELL = ['./', './index.html', './ai-config.js', './assistant.css', './ai-assistant.js', './manifest.json', './brand-logo.jpg', './offline-engine.js', './sqlite-engine.js', './vendor/sql.js/sql-wasm.js', './vendor/sql.js/sql-wasm.wasm', './er-recognizer.js', './er-editor.js', './self-test.js', './fallback.js'];

// 这些文件在部署后会更新，采用“网络优先”以保证刷新即可看到新版本；离线时回退到缓存。
function isNetworkFirst(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return true;
  const name = url.pathname.split('/').pop();
  return name === 'index.html' || name === 'ai-config.js';
}

function cacheFirst(request) {
  return caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html')));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (!isNetworkFirst(event.request, url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
