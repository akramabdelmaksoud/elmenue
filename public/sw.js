// Service worker: lets the captain / kitchen screens be installed like an app and receive push notifications while the phone is locked.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});   // network only (keeps deployments instantly fresh); required for installability
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
