import { LocalNotifications } from '@capacitor/local-notifications'
import { useAppStore } from '@/store/app.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import router from '@/router'
import { PushNotifications } from '@capacitor/push-notifications'
import { NotificationType } from '@/types/server.types'
import { useToast } from '@/service/toast.service'

export async function requestNotifications() {
  let permStatus = await LocalNotifications.checkPermissions()

  if (permStatus.display !== 'granted') {
    permStatus = await LocalNotifications.requestPermissions()
  }

  if (permStatus.display !== 'granted') {
    const { toast } = useToast()
    toast('Please enable notifications from your device settings', { color: 'danger' })
    throw new Error('User denied permissions!')
  }

  await requestLocalNotifications()
  await requestPushNotifications()
}

export function disableNotifications() {
  disableLocalNotifications()
  const { setNotifications } = useAppStore()
  setNotifications(undefined)
}

async function requestLocalNotifications() {
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
  const pending = await LocalNotifications.getPending()
  await LocalNotifications.cancel({
    notifications: pending.notifications
  })
}

export async function addNotificationListeners() {
  await PushNotifications.addListener('registration', token => {
    const { setNotifications } = useAppStore()
    setNotifications(token.value)
  })

  // Called when the app is active
  await PushNotifications.addListener('pushNotificationReceived', notification => {
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
}

function next2pm() {
  // Determine the next occurrence of 2:00 PM
  let now = new Date()
  let next2PM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0)

  // If we've already passed 2:00 PM today, schedule for tomorrow
  if (now.getTime() > next2PM.getTime()) {
    next2PM.setDate(next2PM.getDate() + 1)
  }
  return next2PM
}
