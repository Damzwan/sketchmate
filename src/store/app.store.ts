// Utilities
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { CommentRes, InboxItem, Mate, NotificationSubscription, NotificationType, User } from '@/types/server.types'
import { useSocketService } from '@/service/api/socket.service'
import { useAPI } from '@/service/api/api.service'
import { LocalStorage } from '@/types/storage.types'
import { Preferences } from '@capacitor/preferences'
import { compareVersions, generateDeviceFingerprint, getCurrentAuthUser, isNative } from '@/helper/general.helper'
import { Keyboard } from '@capacitor/keyboard'
import { useToast } from '@/service/toast.service'
import { ConnectionStatus, Network } from '@capacitor/network'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { viewCommentButton } from '@/config/toast.config'
import { ToastDuration } from '@/types/toast.types'
import { Device } from '@capacitor/device'
import { useIonRouter } from '@ionic/vue'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { routerAnimation } from '@/helper/animation.helper'


export const useAppStore = defineStore('app', () => {
  const user = ref<User>()
  const inbox = ref<InboxItem[]>()
  const inboxUsers = ref<Mate[]>([])

  const isLoggedIn = ref(false)
  const isLoading = ref(false)
  const friendRequestLoading = ref(false)
  const friendRequestUsers = ref<Mate[]>([])

  const isSendingDrawing = ref(false)
  const showForceUpdateModal = ref(false)


  const notificationRouteLoading = ref<NotificationType>()
  const reviewAppAlertOpen = ref(false)

  const unreadMsg = localStorage.getItem(LocalStorage.unread)
  const unreadMessages = ref(unreadMsg ? parseInt(unreadMsg) : 0)

  const api = useAPI()

  const queryParams = ref<URLSearchParams>()
  const isNewAccount = ref(false)
  const showSettingsOnLoginModal = ref(false)

  // used to show assets even though we are not logged in yet
  const localSubscription = ref<string>()
  const localUserImg = ref<string | null>(null)

  const keyboardHeight = ref(0)
  const installPrompt = ref<any>()
  const userDeletedError = ref(false)

  const ionRouter = useIonRouter()

  const networkStatus = ref<ConnectionStatus>()
  const updateSlide = ref(false)
  const deviceFingerprint = ref<string>()
  const isAuthLoading = ref(true)
  generateDeviceFingerprint().then(fingerprint => deviceFingerprint.value = fingerprint)


  FirebaseAuthentication.addListener('authStateChange', async (status) => {
    isAuthLoading.value = false
    if (!status.user) await router.replace(`/${FRONTEND_ROUTES.login}`)
    else {
      const justLoggedIn = await Preferences.get({ key: LocalStorage.login })
      if (justLoggedIn.value) {
        isAuthLoading.value = true
        const user = await login()
        if (user!.mates.length == 0) ionRouter.replace(FRONTEND_ROUTES.connect, routerAnimation)
        else ionRouter.replace(FRONTEND_ROUTES.draw, routerAnimation)
      } else {
        if (router.currentRoute.value.path == `/${FRONTEND_ROUTES.login}`) ionRouter.replace(`/${FRONTEND_ROUTES.draw}`, routerAnimation)
        await login()
      }
    }
  })


  if (isNative()) Keyboard.addListener('keyboardWillShow', info => (keyboardHeight.value = info.keyboardHeight))

  Preferences.get({ key: LocalStorage.img }).then(res => (localUserImg.value = res.value!))

  Network.addListener('networkStatusChange', status => {
    networkStatus.value = status
    if (status.connected) refresh()
  })
  Network.getStatus().then(s => (networkStatus.value = s))

  async function login() {
    try {
      const socketService = useSocketService()
      socketService.connect()

      const authUser = await getCurrentAuthUser()
      if (!authUser) return


      const userValue = await api.getUser({ auth_id: authUser.uid })
      if (!userValue) throw new Error()

      if (isNative() && compareVersions(__APP_VERSION__, userValue.minimum_supported_version) == -1) {
        showForceUpdateModal.value = true
        return
      }

      user.value = userValue.user as User

      Preferences.get({ key: LocalStorage.login }).then(res => {
        if (!res.value) return
        api.onLoginEvent({ user_id: user.value!._id, fingerprint: deviceFingerprint.value!, loggedIn: true })
        if (isNewAccount.value || !user.value!.subscriptions.some(s => s.fingerprint == deviceFingerprint.value)) showSettingsOnLoginModal.value = true

        Preferences.remove({ key: LocalStorage.login })
        isAuthLoading.value = false
      })
      isNewAccount.value = userValue.new_account

      socketService.login({ _id: user.value!._id })
      isLoggedIn.value = true

      Preferences.set({ key: LocalStorage.img, value: user.value!.img })
      Preferences.set({ key: LocalStorage.user_id, value: user.value!._id })

      Preferences.get({ key: LocalStorage.reviewPromptCount }).then((reviewPromptCount) => {
        if (!reviewPromptCount.value) Preferences.set({ key: LocalStorage.reviewPromptCount, value: '2' })
      })


      return user.value
    } catch (e) {
      console.log(e)
    }
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
      inbox.value = retrievedInbox.inboxItems
      inboxUsers.value = [...inboxUsers.value, ...retrievedInbox.userInfo]
    } catch (e) {
      console.log(e)
    }
  }

  async function refresh(e?: any) {
    const authUser = await getCurrentAuthUser()
    if (!authUser) return
    user.value = (await api.getUser({ auth_id: authUser.uid }))!.user
    await getInbox()
    if (e) e.target.complete()
  }

  async function setNotifications(token: string | undefined) {
    localSubscription.value = token
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
      user.value!.subscriptions.push(subscription)
      await api.subscribe({ user_id: user.value!._id, subscription })
    }
  }

  function addComment(commentRes: CommentRes) {
    if (!inbox.value) return
    const index = inbox.value!.findIndex(inboxItem => inboxItem._id === commentRes.inbox_item_id)
    if (index == -1) return
    inbox.value![index].comments.push(commentRes.comment)
    inbox.value![index].comments_seen_by = [user.value!._id]

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

  function consumeNotificationLoading(consumeType: NotificationType) {
    if (consumeType == notificationRouteLoading.value) notificationRouteLoading.value = undefined
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

  function logout() {
    isLoggedIn.value = false
    api.onLoginEvent({ user_id: user.value!._id, fingerprint: deviceFingerprint.value!, loggedIn: false })

    FirebaseAuthentication.signOut()
    Preferences.remove({ key: LocalStorage.user_id })
    router.replace(`/${FRONTEND_ROUTES.login}`)
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
    consumeNotificationLoading,
    queryParams,
    setQueryParams,
    localSubscription,
    localUserImg,
    keyboardHeight,
    refresh,
    installPrompt,
    networkStatus,
    userDeletedError,
    updateSlide,
    reviewAppAlertOpen,
    friendRequestLoading,
    inboxUsers,
    findUserInInboxUsers,
    friendRequestUsers,
    retrieveFriendRequestUsers,
    findUserInFriendRequestUsers,
    deviceFingerprint,
    isNewAccount,
    showSettingsOnLoginModal,
    isSendingDrawing,
    isAuthLoading,
    logout,
    showForceUpdateModal
  }
})
