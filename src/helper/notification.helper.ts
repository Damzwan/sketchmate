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

  const messaging = getMessaging()
  const permission = await Notification.requestPermission()

  if (permission != 'granted') {
    toast('Notifications are not allowed, enable them and try again', { color: 'danger' })
    return
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
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
  await LocalNotifications.schedule({
    notifications: [
      {
        title: 'SketchMate time!',
        body: 'Surprise your mate with a nice drawing',
        id: 1,
        schedule: {
          at: next2pm(),
          repeats: true
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

    await PushNotifications.addListener('pushNotificationActionPerformed', notification => {
      const notificationType: NotificationType = notification.notification.data.type
      const { setNotificationLoading } = useAppStore()
      setNotificationLoading(notificationType)
      if (notificationType === NotificationType.match) router.push(FRONTEND_ROUTES.mate)
      else if (notificationType === NotificationType.unmatch) router.push(FRONTEND_ROUTES.connect)
      if (notificationType === NotificationType.message) {
        router.push({
          path: FRONTEND_ROUTES.gallery,
          query: {
            item: notification.notification.data.inbox_id
          }
        })
      } else if (notificationType === NotificationType.comment)
        router.push({
          path: FRONTEND_ROUTES.gallery,
          query: {
            item: notification.notification.data.inbox_id,
            comments: 'true'
          }
        })
    })

    await LocalNotifications.addListener('localNotificationActionPerformed', notification => {
      router.push(FRONTEND_ROUTES.draw)
      LocalNotifications.removeDeliveredNotifications({ notifications: [notification.notification] })
    })
  } else {
    const channel = new BroadcastChannel('pwa_sw')
    channel.onmessage = function (event) {
      const data = event.data
      router.push({ path: data.path, query: data.query })
    }
  }
}

function next2pm() {
  // Determine the next occurrence of 2:00 PM
  const now = new Date()
  const next2PM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0)

  // If we've already passed 2:00 PM today, schedule for tomorrow
  if (now.getTime() > next2PM.getTime()) {
    next2PM.setDate(next2PM.getDate() + 1)
  }
  return next2PM
}
