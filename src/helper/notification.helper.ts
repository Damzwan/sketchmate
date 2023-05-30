import { LocalNotifications } from '@capacitor/local-notifications'
import { useAppStore } from '@/store/app.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import router from '@/router'
import { PermissionStatus, PushNotifications } from '@capacitor/push-notifications'
import { NotificationType } from '@/types/server.types'
import { storeToRefs } from 'pinia'

export async function requestNotifications() {
  const status = await PushNotifications.requestPermissions()
  await requestLocalNotifications(status)
  await requestPushNotifications(status)
}

export function disableNotifications() {
  disableLocalNotifications()
  const { setNotifications } = useAppStore()
  setNotifications(undefined)
}

async function requestLocalNotifications(status: PermissionStatus) {
  if (status.receive == 'granted') {
    await LocalNotifications.schedule({
      notifications: [
        {
          title: 'SketchMate time!',
          body: 'Surprise your mate with a nice drawing',
          id: 1,
          schedule: {
            at: randomTimeBetween(14, 19),
            repeats: true
          }
        }
      ]
    })
  }
}

async function requestPushNotifications(status: PermissionStatus) {
  if (status.receive !== 'granted') {
    throw new Error('User denied permissions!')
  }

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

function randomTimeBetween(hoursStart: number, hoursEnd: number) {
  const randomHour = Math.floor(Math.random() * (hoursEnd - hoursStart + 1)) + hoursStart
  const randomMinute = Math.floor(Math.random() * 60)
  const now = new Date()
  const scheduledDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), randomHour, randomMinute)

  // If the scheduled time is in the past, add one day to the date
  if (scheduledDate < now) {
    scheduledDate.setDate(scheduledDate.getDate() + 1)
  }

  return scheduledDate
}
