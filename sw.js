// Devit Service Worker — Web Push + Offline Shell Cache
const CACHE = 'devit-v1';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/devit.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Push event — show notification
self.addEventListener('push', e => {
  let data = { title: 'Devit', body: 'You have a new notification', icon: '/devit.png', url: '/' };
  try { data = { ...data, ...e.data.json() }; } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/devit.png',
      badge: '/devit.png',
      data: { url: data.url || '/' },
      vibrate: [100, 50, 100],
      tag: data.tag || 'devit-notif',
      renotify: true,
    })
  );
});

// Notification click — focus or open app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});

// Network-first fetch with cache fallback for shell assets
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Don't intercept Supabase or external requests
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
