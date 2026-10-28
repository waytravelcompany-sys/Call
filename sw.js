/* TRUE CHAT — service worker : installation PWA, mode hors-ligne et notifications push */
const CACHE = 'truechat-shell-v3';
const CDN_CACHE = 'truechat-cdn-v1';
const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
// Bibliothèque Supabase (chargée depuis esm.sh) : nécessaire pour ouvrir l'app sans réseau
const SUPABASE_ENTRY = 'https://esm.sh/@supabase/supabase-js@2';

/* Télécharge un module esm.sh et les modules qu'il importe (profondeur limitée) */
async function cacheModule(cache, url, depth = 0) {
  if (depth > 5) return;
  if (await cache.match(url)) return;
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) return;
  await cache.put(url, response.clone());
  const text = await response.text();
  const found = new Set();
  const pattern = /(?:from|import)\s*["'](\/[^"']+|https:\/\/esm\.sh\/[^"']+)["']/g;
  let match;
  while ((match = pattern.exec(text))) {
    found.add(new URL(match[1], url).href);
  }
  for (const next of found) {
    await cacheModule(cache, next, depth + 1).catch(() => {});
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(CACHE);
    await Promise.all(SHELL.map(url => shell.add(url).catch(() => null)));
    try {
      const cdn = await caches.open(CDN_CACHE);
      await cacheModule(cdn, SUPABASE_ENTRY);
    } catch (error) {
      /* hors-ligne ou bloqué : le cache se remplira à la prochaine visite */
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE && key !== CDN_CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Modules esm.sh : cache d'abord (version figée), sinon réseau puis mise en cache
  if (url.hostname === 'esm.sh') {
    event.respondWith(
      caches.open(CDN_CACHE).then(async cache => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }
  // Supabase (données privées), autres sites : jamais en cache
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
