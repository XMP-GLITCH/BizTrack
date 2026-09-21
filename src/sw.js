import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/**
 * TAKE OVER IMMEDIATELY. Without these two lines `registerType: 'autoUpdate'`
 * does nothing at all.
 *
 * A new worker installs and then sits in "waiting" until either every client
 * closes or something sends it SKIP_WAITING. Under the old `prompt` strategy
 * that something was the "Update now" button -- which lived inside the main
 * shell, past eight early returns, so anyone on the sign-in wall, onboarding
 * or the PIN lock could never reach it. The owner's own browser sat on a
 * month-old build with no way out while the apex served the new one, and
 * incognito was the only place the update appeared.
 *
 * `skipWaiting` activates this worker at once; `clients.claim()` puts open
 * pages under it. vite-plugin-pwa's autoUpdate then sees `activated` with
 * `isUpdate` and reloads the page, which is what actually completes the swap.
 *
 * The reload is not cosmetic and must not be delayed for long.
 * `cleanupOutdatedCaches()` above deletes the PREVIOUS precache the moment
 * this worker activates, so a page left running on the old build holds hashed
 * chunk URLs that no longer exist -- the lazily-imported chart is the one
 * that would 404. Reloading straight away is the shorter window, not the
 * longer one.
 *
 * The cost, accepted deliberately: a half-filled form is lost when this
 * fires. Recorded sales are not, because every mutation is already written
 * to localStorage before this can happen.
 */
self.skipWaiting();
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Cache fonts
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(event.notification.data?.url || '/');
    })
  );
});

// BACKGROUND UPDATE NOTIFICATION
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // If this is an update (there's an active worker)
      if (self.registration.active) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        // If app is closed, show a notification
        if (clients.length === 0 && Notification.permission === 'granted') {
          await self.registration.showNotification('BizTrack Update Available ✨', {
            body: 'A new version of BizTrack is ready. Tap to update.',
            icon: '/pwa-192x192.png',
            badge: '/favicon-32.png',
            tag: 'app-update',
          });
        }
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
