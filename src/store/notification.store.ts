import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { Device } from '@capacitor/device'
import { useAPI } from '@/service/api/api.service'
import { NotificationSubscription, NotificationType, User } from '@/types/server.types'
import { LocalStorage } from '@/types/storage.types'
import { generateDeviceFingerprint, isNative } from '@/helper/general.helper'
import { PushNotifications } from '@capacitor/push-notifications'
import { useAuthStore } from '@/store/auth.store'

export const useNotificationStore = defineStore('notification', () => {
  const localSubscription = ref<string>()
  const notificationsAllowed = ref(false)
  const showEnableNotificationsAfterLogin = ref(false)
  const notificationRouteLoading = ref<NotificationType>()


  const deviceNotificationsAllowed = computed(() => {
    const { user, deviceFingerprint } = useAuthStore()
    return localSubscription.value || user?.subscriptions.some(s => s.fingerprint === deviceFingerprint) && notificationsAllowed.value
  })


  const api = useAPI()

  async function setNotifications(token: string | undefined) {
    const { user } = storeToRefs(useAuthStore())

    if (!user.value?._id) return

    if (token && token === localSubscription.value) return

    localSubscription.value = token

    if (token) {
      await Preferences.set({ key: LocalStorage.notificationToken, value: token })
    } else {
      await Preferences.remove({ key: LocalStorage.notificationToken })
    }

    // Device fingerprint for subscription
    const deviceInfo = await Device.getInfo()
    const fingerprint = await generateDeviceFingerprint()


    if (!token) {
      user.value.subscriptions = [...user.value.subscriptions.filter(s => s.fingerprint !== fingerprint)]
      await api.unsubscribe({ user_id: user.value._id, fingerprint })
    } else {
      const subscription: NotificationSubscription = {
        token,
        fingerprint,
        model: deviceInfo.model,
        platform: deviceInfo.platform,
        os: deviceInfo.operatingSystem,
        logged_in: true
      }
      user.value.subscriptions = [...user.value.subscriptions, subscription]
      await api.subscribe({ user_id: user.value._id, subscription })
    }
  }

  function setNotificationLoading(type: NotificationType) {
    notificationRouteLoading.value = type
    setTimeout(() => (notificationRouteLoading.value = undefined), 3000)
  }

  async function init(user: User, arrivedFromLogin: boolean = false) {
    const token = localSubscription.value
    let hasValidSubscription = !!(token && user.subscriptions.some(s => s.token === token))

    const permissionStatus = isNative() ? await PushNotifications.checkPermissions() : { receive: false }
    const hasPermission = permissionStatus.receive === 'granted'

    if (arrivedFromLogin) {
      const { deviceFingerprint } = useAuthStore()
      showEnableNotificationsAfterLogin.value = !(user?.subscriptions.some(s => s.fingerprint === deviceFingerprint) && notificationsAllowed.value)
    }

    notificationsAllowed.value = hasValidSubscription && hasPermission
  }

  return {
    localSubscription,
    notificationsAllowed,
    showEnableNotificationsAfterLogin,
    notificationRouteLoading,
    deviceNotificationsAllowed,

    setNotifications,
    setNotificationLoading,
    init
  }
})
