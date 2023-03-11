import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const channel = new BroadcastChannel('navigation');

self.addEventListener('push', (event) => {
  const data = event.data.json();
  const payload = data.payload;

  const options = {
    icon: payload.img,
    image: payload.img,
    badge: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/7a3ec529632909.55fc107b84b8c.png',
    data: payload,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const payload = event.notification.data;
  if (payload.type === 'message') toGallery(event, payload.item);
  else toConnect(event);
});

function toConnect(event) {
  handleNavigation(event, '/connect');
}

function toGallery(event, item) {
  handleNavigation(event, `/gallery?item=${item}`);
}

function handleNavigation(event, url) {
  channel.postMessage({ url: url });

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      else
        return self.clients.openWindow(url).then((client) => {
          client.focus();
        });
    })
  );
}
