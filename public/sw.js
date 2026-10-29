// Service worker: lets the captain / kitchen screens be installed like an app and receive push notifications while the phone is locked.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// App shell for the staff screens: network first (a deployment is picked up at once), the last good copy when the network is gone.
// Only the staff pages and their static files are cached - never /api, never guest pages, so no order data is ever stored here.
const SHELL = 'staff-shell-v1', STAFF_PAGE = /^\/(captain|cashier)(\/|$)/, STATIC = /^\/(shared\.(js|css)|pos\.js|escpos\.js|i18n\.js|ar-ui\.js|auth\.(js|css)|floor\.css|pro\.css|luxe\.css|sig\.css|maison\.css|icons\/.*|vendor\/.*|engine\/.*)$/;
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (!(STAFF_PAGE.test(u.pathname) || STATIC.test(u.pathname))) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(SHELL).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || new Response('Offline', { status: 503 }))));
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Café', body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    // if the app is already open and visible, the page plays its own sound/banner - skip the duplicate system notification
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible')) return;
    await self.registration.showNotification(d.title || 'Café', { body: d.body || '', tag: d.tag || 'cafe', renotify: true, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', vibrate: d.urgent ? [300, 120, 300, 120, 300] : [200, 100, 200], requireInteraction: !!d.urgent, data: { url: d.url || '/captain' } });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/captain';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => { const w = wins.find((x) => x.url.includes(url.replace(/^\//, ''))) || wins[0]; return w ? w.focus() : self.clients.openWindow(url); }));
});
