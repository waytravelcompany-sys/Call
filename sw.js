/* TRUE CHAT — service worker : installation PWA, mode hors-ligne (coquille) et notifications push */
const CACHE = 'truechat-shell-v1';
const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll échoue en bloc si un fichier manque : on les ajoute un par un
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Supabase, CDN, etc. : jamais en cache (données privées, temps réel)
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Page : réseau d'abord, copie en cache si hors-ligne
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  // Fichiers statiques : cache puis mise à jour en arrière-plan
  event.respondWith(
    caches.match(request).then(hit => {
      const refresh = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});

/* ---------- Notifications push ---------- */
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'TRUE CHAT';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Nouveau message',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || data.conversation_id || 'truechat',
      renotify: true,
      data: { conversation_id: data.conversation_id || null }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const id = event.notification.data?.conversation_id;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if (id) client.postMessage({ type: 'open-room', id });
        return;
      }
    }
    await self.clients.openWindow('./index.html' + (id ? '#room=' + id : ''));
  })());
});
