// src/stores/auth.store.ts
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { FirebaseAuthentication, User as FirebaseUser } from '@capacitor-firebase/authentication'
import { UseIonRouterResult } from '@ionic/vue'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'

import { User } from '@/types/server.types'
import { LocalStorage } from '@/types/storage.types'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'

import {
  compareVersions,
  generateDeviceFingerprint,
  getCurrentAuthUser,
  isNative,
  isOldEnough
} from '@/helper/general.helper'
import { routerAnimation } from '@/helper/animation.helper'
import { useNotificationStore } from '@/store/notification.store'
import { useBalloonStore } from '@/store/balloon.store'
import { useInboxStore } from '@/store/inbox.store'
import { useSocketService } from '@/service/api/socket/socket.service'
import { useSessionStore } from '@/store/session.store'
import { leaveRoom } from '@/service/api/socket/drawSyncing.socket'
import { mixpanelIdentify } from '@/service/mixpanel'
import { useFriendStore } from '@/store/friend.store'
import { useChatStore } from '@/store/chat.store'

export const useAuthStore = defineStore('auth', () => {
  const api = useAPI()

  const user = ref<User>()
  const firebaseUser = ref<FirebaseUser>()

  const isLoggedIn = ref(false)
  const isAuthLoading = ref(true)
  const isNewAccount = ref(false)
  const showForceUpdateModal = ref(false)
  const deviceFingerprint = ref<string>()

  let ionRouter: UseIonRouterResult | undefined = undefined

  const notificationStore = useNotificationStore()
  const balloonStore = useBalloonStore()
  const localUserImg = ref<string>()

  const refreshNeeded = ref(false) // only needed when socket disconnects
  const showTutorial = ref(false)

  Preferences.get({ key: LocalStorage.img }).then(res => (localUserImg.value = res.value!))

  // TODO Bad name, used for matching
  const isLoading = ref(false)

  // Derived
  const shouldShowDateOfBirthConfirmation = computed(
    () => user.value ? user.value.date_of_birth == undefined || !isOldEnough(user.value.date_of_birth) : false
  )

  generateDeviceFingerprint().then(fingerprint => deviceFingerprint.value = fingerprint)

  FirebaseAuthentication.addListener('authStateChange', async (status) => {
    if (!ionRouter) {
      throw new Error('IonRouter not initialized')
    }

    if (!status.user) {
      // User is logged out
      await router.isReady()
      isLoggedIn.value = false
      user.value = undefined
      firebaseUser.value = undefined


      await router.replace(FRONTEND_ROUTES.login!)


      isAuthLoading.value = false


      return
    }

    // User logged in
    firebaseUser.value = status.user

    const justLoggedIn = await Preferences.get({ key: LocalStorage.login })

    // If arriving from login page
    if (justLoggedIn.value) {
      const result = await login()

      if (!result) {
        const { toast } = useToast()
        toast('Something went wrong, please try again', { color: 'warning' })
        return
      }

      const [authUser, newAcc] = result
      isAuthLoading.value = false

      const { showEnableNotificationsAfterLogin } = useNotificationStore()

      if (newAcc || showEnableNotificationsAfterLogin) {
        // new user is routed in login.view.vue
        return
      }


      // TODO testing whether this is better
      ionRouter.replace(FRONTEND_ROUTES.home, routerAnimation)
    } else {
      // Auto-login (no login intent)
      isAuthLoading.value = false

      const result = await login()

      if (!result) {
        const { toast } = useToast()
        toast(
          'You’re offline. Local drawing is still available. Reopen the app to retry.',
          { color: 'warning' }
        )
        ionRouter.replace(FRONTEND_ROUTES.home, routerAnimation)
        return
      }

      const [authUser] = result
      const allowedRoutes = Object.values(FRONTEND_ROUTES).filter(
        p => p !== FRONTEND_ROUTES.login
      ) as Partial<FRONTEND_ROUTES>[]


      // 2. Check if the user was trying to reach a specific room/page
      const { redirectIntent } = useSessionStore()
      if (redirectIntent) {
        ionRouter.replace(redirectIntent, routerAnimation)
        return
      }

      // 3. Fallback: Stay where you are if it's allowed, otherwise go to draw
      const path = router.currentRoute.value.path.split('/')[1]
      if (allowedRoutes.includes(path as FRONTEND_ROUTES)) {
        ionRouter.replace(path, routerAnimation)
      } else {
        ionRouter.replace(FRONTEND_ROUTES.home, routerAnimation)
      }


    }
  })


  async function login(): Promise<[User, boolean] | null> {
    try {
      const socketService = useSocketService()
      socketService.connect()

      const authUser = await getCurrentAuthUser()
      if (!authUser) return null

      const userValue = await api.getUser({ auth_id: authUser.uid })
      if (!userValue) throw new Error()

      showTutorial.value = !userValue.user.last_seen_version


      // Parse DOB
      if (userValue.user.date_of_birth) {
        userValue.user.date_of_birth = new Date(userValue.user.date_of_birth)
      }

      // Native version check
      if (
        isNative() &&
        compareVersions(__APP_VERSION__, userValue.minimum_supported_version) === -1
      ) {
        showForceUpdateModal.value = true
        return null
      }

      const arrivedFromLogin = await Preferences.get({ key: LocalStorage.login })


      user.value = userValue.user
      isLoggedIn.value = true
      isNewAccount.value = userValue.new_account

      socketService.login({ _id: user.value!._id })
      balloonStore.init(user.value)
      await notificationStore.init(user.value, !!arrivedFromLogin.value)

      const friendStore = useFriendStore()
      const chatStore = useChatStore()
      friendStore.initializeSocialGraph(user.value)
      chatStore.loadActiveChats()

      // Store user id locally
      // TODO maybe remove
      Preferences.set({ key: LocalStorage.user_id, value: user.value!._id })
      Preferences.set({ key: LocalStorage.img, value: user.value!.img })

      mixpanelIdentify(user.value._id)
      if (arrivedFromLogin.value && deviceFingerprint.value) {
        api.onLoginEvent({
          user_id: user.value!._id,
          fingerprint: deviceFingerprint.value,
          loggedIn: true
        })
      }

      Preferences.remove({ key: LocalStorage.login })

      return [user.value, isNewAccount.value]
    } catch (e) {
      console.error(e)
      return null
    }
  }

  function initIonRouter(r: UseIonRouterResult) {
    ionRouter = r
  }

  // TODO not ideal
  async function refresh(e?: any) {
    const authUser = await getCurrentAuthUser()
    const { toast } = useToast()

    if (!authUser) {
      toast('Something went wrong, please try again.', { color: 'danger' })
      return
    }
    const userValue = await api.getUser({ auth_id: authUser.uid })
    if (!userValue) {
      toast('Something went wrong, please try again.', { color: 'danger' })
      return
    }

    if (userValue.user.date_of_birth) {
      userValue.user.date_of_birth = new Date(userValue.user.date_of_birth)
    }
    user.value = userValue.user


    const { getInboxBatch } = useInboxStore()
    await getInboxBatch(true)
    if (e) e.target.complete()
  }

  async function logout() {
    // TODO can be done better
    const { showEnableNotificationsAfterLogin } = storeToRefs(useNotificationStore())
    showEnableNotificationsAfterLogin.value = false

    Preferences.remove({ key: LocalStorage.user_id })
    Preferences.remove({ key: LocalStorage.notificationToken })

    const { disconnect } = useSocketService()
    if (deviceFingerprint.value) {
      api.onLoginEvent({
        user_id: user.value!._id,
        fingerprint: deviceFingerprint.value,
        loggedIn: false
      })
    }

    disconnect()
    await FirebaseAuthentication.signOut()
    isLoggedIn.value = false
    user.value = undefined
  }

  return {
    user,
    firebaseUser,
    isLoggedIn,
    isAuthLoading,
    isNewAccount,
    showForceUpdateModal,
    isLoading,
    shouldShowDateOfBirthConfirmation,
    deviceFingerprint,
    localUserImg,
    showTutorial,

    initIonRouter,
    login,
    logout,
    refresh,
    refreshNeeded
  }
})
