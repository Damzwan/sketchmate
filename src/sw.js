self.addEventListener('push', (event) => {
    const {title} = {title: 'New drawing from partner!'}
    const options = {
      icon: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/7a3ec529632909.55fc107b84b8c.png',
      image: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/7a3ec529632909.55fc107b84b8c.png',
      badge: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/7a3ec529632909.55fc107b84b8c.png'
    }

    event.waitUntil(self.registration.showNotification(title, options))
  }
)

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll().then(function (clients) {
      // Redirect the first available window to the specified URL
      if (clients && clients.length) {
        const windowClient = clients[0];
        return windowClient.navigate('/messages');
      }
    })
  );
})
