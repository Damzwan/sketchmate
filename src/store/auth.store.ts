// Utilities
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { CommentRes, InboxItem, Mate, NotificationSubscription, NotificationType, User } from '@/types/server.types'
import { useSocketService } from '@/service/api/socket.service'
import { useAPI } from '@/service/api/api.service'
import { LocalStorage } from '@/types/storage.types'
import { Preferences } from '@capacitor/preferences'
import { compareVersions, generateDeviceFingerprint, getCurrentAuthUser, isNative } from '@/helper/general.helper'
import { useToast } from '@/service/toast.service'
import { ConnectionStatus, Network } from '@capacitor/network'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { viewCommentButton } from '@/config/toast.config'
import { ToastDuration } from '@/types/toast.types'
import { Device } from '@capacitor/device'
import { modalController, useIonRouter, UseIonRouterResult } from '@ionic/vue'
import { FirebaseAuthentication, User as FirebaseUser } from '@capacitor-firebase/authentication'
import { routerAnimation } from '@/helper/animation.helper'
import { Nullable } from 'vitest'


export const useAuthStore = defineStore('auth', () => {
  const user = ref<User>()
  const firebaseUser = ref<FirebaseUser>()
  const inbox = ref<InboxItem[]>([])
  const inboxUsers = ref<Mate[]>([])

  const isLoggedIn = ref(false)
  const isLoading = ref(false)
  const friendRequestLoading = ref(false)
  const friendRequestUsers = ref<Mate[]>([])

  const isSendingDrawing = ref(false)
  const showForceUpdateModal = ref(false)


  const notificationRouteLoading = ref<NotificationType>()

  const unreadMsg = localStorage.getItem(LocalStorage.unread)
  const unreadMessages = ref(unreadMsg ? parseInt(unreadMsg) : 0)

  const api = useAPI()

  const queryParams = ref<URLSearchParams>()
  const isNewAccount = ref(false)
  const showEnableNotificationsAfterLogin = ref(false)

  // used to show assets even though we are not logged in yet
  const localSubscription = ref<string>()
  const localUserImg = ref<string | null>(null)

  const installPrompt = ref<any>()
  const userDeletedError = ref(false)


  const networkStatus = ref<ConnectionStatus>()
  const notificationsAllowed = ref(false)


  const updateSlide = ref(false)
  const deviceFingerprint = ref<string>()
  const isAuthLoading = ref(true)

  let ionRouter: UseIonRouterResult | undefined = undefined


  generateDeviceFingerprint().then(fingerprint => deviceFingerprint.value = fingerprint)


  FirebaseAuthentication.addListener('authStateChange', async (status) => {
    if (!ionRouter) {
      throw new Error('IonRouter not initialized')
      return
    }
    if (!status.user) {
      await router.isReady()
      isAuthLoading.value = false
      if (router.currentRoute.value.query.mate) {
        setTimeout(() => {
          const { toast } = useToast()
          toast('Login first before using a connect link', { color: 'warning', duration: ToastDuration.long })
        }, 200) // cannot do immediately since page is not ready yet
      }
      await ionRouter.replace(FRONTEND_ROUTES.login, routerAnimation!)
    } else {
      firebaseUser.value = status.user
      const justLoggedIn = await Preferences.get({ key: LocalStorage.login })
      if (justLoggedIn.value) {
        const result = await login()

        if (!result) {
          const { toast } = useToast()
          toast('Something went wrong, please try again', { color: 'warning' })
          return
        }

        const [user, isNewAccount, showEnableNotificationsAfterLoginTmp] = result
        isAuthLoading.value = false


        // isNewAccount state is set, we handle the remainder of the logging in in login.view.vue
        if (isNewAccount) {
        } else if (showEnableNotificationsAfterLoginTmp) {
          showEnableNotificationsAfterLogin.value = showEnableNotificationsAfterLoginTmp
          return
        } else {
          if (user.mates.length == 0) ionRouter.replace(FRONTEND_ROUTES.connect, routerAnimation)
          else ionRouter.replace(FRONTEND_ROUTES.draw, routerAnimation)
        }


      } else {
        isAuthLoading.value = false
        const result = await login()
        if (!result) {
          const { toast } = useToast()
          ionRouter.replace(FRONTEND_ROUTES.draw, routerAnimation)
          toast('You’re offline. Local drawing is still available. Try again by reopening the app.', {
            color: 'warning',
            duration: ToastDuration.long
          })
          return

        }
        const [user, _, __] = result

        if (user.mates.length == 0) ionRouter.replace(FRONTEND_ROUTES.connect, routerAnimation)
        else {
          const path = router.currentRoute.value.path.split('/')[1]
          if (Object.values(FRONTEND_ROUTES).filter(p => p != FRONTEND_ROUTES.login).includes(path as FRONTEND_ROUTES)) {
            ionRouter.replace(path, routerAnimation)
          } else ionRouter.replace(FRONTEND_ROUTES.draw, routerAnimation)
        }

      }
    }
  })


  Preferences.get({ key: LocalStorage.img }).then(res => (localUserImg.value = res.value!))

  Network.addListener('networkStatusChange', status => {
    if (status.connected && !networkStatus.value?.connected) {
      refresh().then(() => {
        const { toast } = useToast()
        toast('You are now online', { color: 'success', duration: ToastDuration.long })
      })
    } else if (!status.connected) {
      isLoggedIn.value = false
      const { toast } = useToast()
      toast('You are now offline', { color: 'danger', duration: ToastDuration.long })
    }
    networkStatus.value = status
  })
  Network.getStatus().then(s => (networkStatus.value = s))

  async function login(): Promise<Nullable<[User, boolean, boolean]>> {
    try {
      const socketService = useSocketService()
      socketService.connect()

      const authUser = await getCurrentAuthUser()
      if (!authUser) return

      let showEnableNotificationsAfterLogin = false


      const userValue = await api.getUser({ auth_id: authUser.uid })
      if (!userValue) throw new Error()

      if (isNative() && compareVersions(__APP_VERSION__, userValue.minimum_supported_version) == -1) {
        showForceUpdateModal.value = true
        return
      }


      user.value = userValue.user as User

      const arrivedFromLogin = await Preferences.get({ key: LocalStorage.login })
      if (arrivedFromLogin) {
        api.onLoginEvent({ user_id: user.value!._id, fingerprint: deviceFingerprint.value!, loggedIn: true })
        if (!user.value!.subscriptions.some(s => s.fingerprint == deviceFingerprint.value)) showEnableNotificationsAfterLogin = true
      }
      Preferences.remove({ key: LocalStorage.login })
      isNewAccount.value = userValue.new_account

      socketService.login({ _id: user.value!._id })
      isLoggedIn.value = true

      Preferences.set({ key: LocalStorage.img, value: user.value!.img })
      Preferences.set({ key: LocalStorage.user_id, value: user.value!._id })

      return [user.value, isNewAccount.value, showEnableNotificationsAfterLogin]
    } catch (e) {
      console.log(e)
    }
  }

  function initIonRouter(r: UseIonRouterResult) {
    ionRouter = r
  }


  async function getInbox() {
    try {
      if (user.value!.inbox.length === 0) {
        inbox.value = []
        return
      }
      const retrievedInbox = await api.getInbox({
        _ids: user.value!.inbox
      })
      if (!retrievedInbox) throw new Error()
      inbox.value = (retrievedInbox.inboxItems as any).toReversed() // toReversed not recognised
      inboxUsers.value = [...inboxUsers.value, ...retrievedInbox.userInfo]
    } catch (e) {
      console.log(e)
    }
  }

  async function refresh(e?: any) {
    isLoading.value = true
    await login()
    await getInbox()
    isLoading.value = false // TODO we should not use a global loading state...
    if (e) e.target.complete()
  }

  async function setNotifications(token: string | undefined) {
    if (token && token == localSubscription.value) return
    localSubscription.value = token
    token ? Preferences.set({
      key: LocalStorage.notificationToken,
      value: token
    }) : Preferences.remove({ key: LocalStorage.notificationToken })
    const fingerprint = await generateDeviceFingerprint()

    if (!user.value) return
    if (!token) {
      user.value!.subscriptions = user.value!.subscriptions.filter(s => s.fingerprint != fingerprint)
      await api.unsubscribe({ user_id: user.value!._id, fingerprint: fingerprint })
    } else if (token) {
      const info = await Device.getInfo()
      const subscription: NotificationSubscription = {
        token: token,
        fingerprint: fingerprint,
        model: info.model,
        platform: info.platform,
        os: info.operatingSystem,
        logged_in: true
      }
      user.value!.subscriptions = [...user.value!.subscriptions.filter(sub => sub.fingerprint != subscription.fingerprint), subscription]
      await api.subscribe({ user_id: user.value!._id, subscription })
    }
  }

  async function addComment(commentRes: CommentRes) {
    if (inbox.value.length == 0) await getInbox()
    const index = inbox.value!.findIndex(inboxItem => inboxItem._id === commentRes.inbox_item_id)
    if (index == -1) return
    inbox.value![index].comments.push(commentRes.comment)
    inbox.value![index].comments_seen_by = [commentRes.comment.sender]

    if (commentRes.comment.sender == user.value!._id) return
    const sender = findUserInInboxUsers(commentRes.comment.sender)
    if (!sender) return

    const { toast } = useToast()
    toast(`${sender.name} commented on a drawing`, {
      buttons: [viewCommentButton(commentRes.inbox_item_id)],
      duration: ToastDuration.medium
    })
  }

  function setNotificationLoading(type: NotificationType) {
    notificationRouteLoading.value = type
    setTimeout(() => (notificationRouteLoading.value = undefined), 3000) // something went wrong
  }

  function setQueryParams(params: URLSearchParams | undefined) {
    queryParams.value = params
  }

  function findUserInInboxUsers(user_id: string): Mate | undefined {
    return inboxUsers.value.find(u => u._id == user_id)
  }

  async function retrieveFriendRequestUsers() {
    if (!user.value) return
    friendRequestUsers.value = friendRequestUsers.value.concat((await api.getPartialUsers({ _ids: user.value.mate_requests_received.concat(user.value.mate_requests_sent) }))!)
  }

  function findUserInFriendRequestUsers(user_id: string): Mate | undefined {
    return friendRequestUsers.value.find(u => u._id == user_id)
  }

  // TODO we should remove this logic i think (should check)
  watch(notificationRouteLoading, () => {
    if (notificationRouteLoading.value)
      setTimeout(() => {
        if (notificationRouteLoading.value) {
          const { toast } = useToast()
          notificationRouteLoading.value = undefined
          toast('Something went wrong, please try again', { color: 'warning' })
        }
      }, 4000)
  })

  async function logout() {
    // TODO remove history
    modalController.dismiss()
    isLoggedIn.value = false
    api.onLoginEvent({ user_id: user.value!._id, fingerprint: deviceFingerprint.value!, loggedIn: false })

    inbox.value = []
    isNewAccount.value = false
    user.value = undefined
    showEnableNotificationsAfterLogin.value = false

    FirebaseAuthentication.signOut() // will trigger the logic in auth.store
    Preferences.remove({ key: LocalStorage.user_id })
  }

  return {
    user,
    login,
    isLoading,
    isLoggedIn,
    inbox,
    getInbox,
    unreadMessages,
    setNotifications,
    addComment,
    notificationRouteLoading,
    setNotificationLoading,
    queryParams,
    setQueryParams,
    localSubscription,
    localUserImg,
    refresh,
    installPrompt,
    networkStatus,
    userDeletedError,
    updateSlide,
    friendRequestLoading,
    inboxUsers,
    findUserInInboxUsers,
    friendRequestUsers,
    retrieveFriendRequestUsers,
    findUserInFriendRequestUsers,
    deviceFingerprint,
    isNewAccount,
    showEnableNotificationsAfterLogin,
    isSendingDrawing,
    isAuthLoading,
    logout,
    showForceUpdateModal,
    notificationsAllowed,
    initIonRouter,
    firebaseUser
  }
})
