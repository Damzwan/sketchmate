import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const channel = new BroadcastChannel('pwa_sw')
self.addEventListener('push', event => {
  const data = event.data.json()
  const payload = data.data
  if (payload.silent) return

  const options = {
    image: payload.img,
    data: payload
  }

  event.waitUntil(self.registration.showNotification(data.notification.title, options))
})

// })
//
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const payload = event.notification.data
  if (payload.type === 'message' || payload.type === 'comment')
    toGallery(event, payload.inbox_id, payload.type === 'comment')
  else if (payload.type === 'match' || payload.type === 'unmatched') toConnect(event)
  else toDraw()
})

function toConnect(event) {
  handleNavigation(event, '/connect', {})
}

function toDraw(event) {
  handleNavigation(event, '/draw')
}

function toGallery(event, item, comments) {
  handleNavigation(event, `/gallery`, { item, comments })
}

let pendingMessages = []

self.addEventListener('message', event => {
  event.preventDefault()
  if (event.data && event.data.type === 'client-ready') {
    for (const message of pendingMessages) {
      channel.postMessage(message)
    }
    pendingMessages = []
  }
})

async function handleNavigation(event, path, query) {
  await event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus()
        channel.postMessage({ path, query })
      } else {
        pendingMessages.push({ path, query })
        return self.clients.openWindow(path)
      }
    })
  )
}
