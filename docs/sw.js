// Service worker: permite instalar el panel como app (en el computador o el
// teléfono). Siempre intenta primero la red; sin conexión usa lo guardado.
// Los datos del servidor de Google no pasan por aquí (otro dominio): el panel
// guarda la última respuesta por su cuenta.
const VERSION = 'v3.2.0';
const CACHE = `alerta-sc-${VERSION}`;
const SHELL = ['./', 'styles.css', 'app.js', 'charts.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(e.request)) ?? (await caches.match('./'))),
  );
});

// Al hacer clic en una notificación, se abre (o enfoca) la app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => c.url.startsWith(self.registration.scope));
      return win ? win.focus() : self.clients.openWindow('./');
    }),
  );
});
