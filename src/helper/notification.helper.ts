import { LocalNotifications } from '@capacitor/local-notifications'
import { useAppStore } from '@/store/app.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import router from '@/router'
import { PushNotifications } from '@capacitor/push-notifications'
import { NotificationType } from '@/types/server.types'
import { useToast } from '@/service/toast.service'
import { isNative } from '@/helper/general.helper'
import { getMessaging, getToken } from 'firebase/messaging'

export async function requestNotifications() {
  if (isNative()) {
    let permStatus = await LocalNotifications.checkPermissions()

    if (permStatus.display !== 'granted') {
      permStatus = await LocalNotifications.requestPermissions()
    }

    if (permStatus.display !== 'granted') {
      const { toast } = useToast()
      toast('Please enable notifications from your device settings', { color: 'danger' })
      return
    }

    await requestLocalNotifications()
    await requestPushNotifications()
  } else await PWARequestNotifications()
}

export async function PWARequestNotifications() {
  const { toast } = useToast()

  if (!navigator.serviceWorker) {
    toast('No service worker installed', { color: 'danger' })
    return
  }

  const permission = await Notification.requestPermission()

  if (permission == 'denied') {
    toast('Notifications are not allowed, enable them and try again', { color: 'danger' })
    return
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const messaging = getMessaging()
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_VAPID_PUBLIC,
      serviceWorkerRegistration: registration
    })

    const { setNotifications } = useAppStore()
    setNotifications(token)
  } catch (e) {
    toast(e as string, { color: 'danger' })
    console.log(e)
  }
}

export async function disableNotifications() {
  if (isNative()) await disableLocalNotifications()
  const { setNotifications } = useAppStore()
  await setNotifications(undefined)
}

async function requestLocalNotifications() {
  await disableLocalNotifications()

  // Wait for a short delay to ensure cancellation is complete
  // TODO should not be necessary
  await new Promise((resolve) => setTimeout(resolve, 200))

  await LocalNotifications.schedule({
    notifications: [
      {
        title: 'SketchMate time!',
        body: 'Surprise your mate with a nice drawing',
        id: 1,
        schedule: {
          on: {
            hour: 14,
            minute: 0
          }
        }
      }
    ]
  })
}

async function requestPushNotifications() {
  await PushNotifications.register()
}

async function disableLocalNotifications() {
  await LocalNotifications.cancel({
    notifications: [{ id: 1 }] // TODO LocalNotifications.getPending is not working properly
  })
}

export async function addNotificationListeners() {
  if (isNative()) {
    await PushNotifications.addListener('registration', token => {
      const { setNotifications } = useAppStore()
      setNotifications(token.value)
    })

    // Called when the app is active
    await PushNotifications.addListener('pushNotificationReceived', () => {
      // Hide the standard notification UI
      PushNotifications.getDeliveredNotifications().then(x => {
        PushNotifications.removeDeliveredNotifications(x)
      })
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
      const notificationType: NotificationType = notification.notification.data.type
      const { setNotificationLoading } = useAppStore()
      setNotificationLoading(notificationType)

      await router.isReady()

      if (notificationType === NotificationType.match) await router.push(FRONTEND_ROUTES.connect)
      else if (notificationType === NotificationType.unmatch) await router.push(FRONTEND_ROUTES.connect)
      else if (notificationType === NotificationType.message) {
        await router.push({
          path: FRONTEND_ROUTES.gallery,
          query: {
            item: notification.notification.data.inbox_id
          }
        })
      } else if (notificationType === NotificationType.comment)
        await router.push({
          path: FRONTEND_ROUTES.gallery,
          query: {
            item: notification.notification.data.inbox_id,
            comments: 'true'
          }
        })
      else if (notificationType === NotificationType.friend_request)
        await router.push({
          path: FRONTEND_ROUTES.connect
        })
    })

    await LocalNotifications.addListener('localNotificationActionPerformed', notification => {
      router.push(FRONTEND_ROUTES.draw)
      LocalNotifications.removeDeliveredNotifications({ notifications: [notification.notification] })
    })
  } else {
    const channel = new BroadcastChannel('pwa_sw')
    channel.onmessage = function(event) {
      const data = event.data
      router.push({ path: data.path, query: data.query })
    }
  }
}
