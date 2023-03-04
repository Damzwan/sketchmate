// import {precacheAndRoute} from 'workbox-precaching'
//
// precacheAndRoute(self.__WB_MANIFEST)

const channel = new BroadcastChannel('navigation');

self.addEventListener('push', (event) => {
  const {title} = {title: 'New drawing from partner!'}
  const options = {
    icon: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/7a3ec529632909.55fc107b84b8c.png',
    image: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/7a3ec529632909.55fc107b84b8c.png',
    badge: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/7a3ec529632909.55fc107b84b8c.png'
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = '/messages';
  channel.postMessage({url: url});

  event.waitUntil(
    self.clients.matchAll({type: 'window'}).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      else return self.clients.openWindow(url).then(client => {
        client.focus();
      });
    })
  );

});
