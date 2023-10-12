// Utilities
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { CommentRes, CreateUserParams, InboxItem, NotificationType, User } from '@/types/server.types'
import { useSocketService } from '@/service/api/socket.service'
import { useAPI } from '@/service/api/api.service'
import { LocalStorage } from '@/types/storage.types'
import { Preferences } from '@capacitor/preferences'
import { checkPreferenceConsistency, isNative } from '@/helper/general.helper'
import { Keyboard } from '@capacitor/keyboard'
import { useToast } from '@/service/toast.service'
import { ConnectionStatus, Network } from '@capacitor/network'

export const useAppStore = defineStore('app', () => {
  const user = ref<User>()
  const inbox = ref<InboxItem[]>()

  const isLoggedIn = ref(false)
  const isLoading = ref(false)
  const notificationRouteLoading = ref<NotificationType>()
  const storeReady = ref(false)

  const unreadMsg = localStorage.getItem(LocalStorage.unread)
  const unreadMessages = ref(unreadMsg ? parseInt(unreadMsg) : 0)

  const api = useAPI()

  const queryParams = ref<URLSearchParams>()

  // used to show assets even though we are not logged in yet
  const localSubscription = ref<string>()
  const localUserId = ref<string>('')
  const localUserImg = ref<string | null>(null)

  const keyboardHeight = ref(0)
  const installPrompt = ref<any>()
  const userDeletedError = ref(false)

  const networkStatus = ref<ConnectionStatus>()

  if (isNative()) Keyboard.addListener('keyboardWillShow', info => (keyboardHeight.value = info.keyboardHeight))

  Preferences.get({ key: LocalStorage.user }).then(res => (localUserId.value = res.value ? res.value : ''))
  Preferences.get({ key: LocalStorage.img }).then(res => (localUserImg.value = res.value))

  Network.addListener('networkStatusChange', status => {
    networkStatus.value = status
    if (status.connected) refresh()
  })
  Network.getStatus().then(s => (networkStatus.value = s))

  async function login() {
    try {
      const { value: user_id } = await Preferences.get({ key: LocalStorage.user })
      if (!user_id) return

      const socketService = useSocketService()

      // combine
      const [userValue] = await Promise.all([api.getUser({ _id: user_id }), socketService.login({ _id: user_id })])
      if (!userValue) {
        userDeletedError.value = true
        return
      }

      user.value = userValue
      checkPreferenceConsistency(user.value!)

      isLoggedIn.value = true
    } catch (e) {
      console.log(e)
    }
  }

  async function createUser(userData: CreateUserParams) {
    try {
      user.value = await api.createUser(userData)

      const socketService = useSocketService()
      await socketService.login({ _id: user.value!._id })
      isLoggedIn.value = true
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
      inbox.value = retrievedInbox
    } catch (e) {
      console.log(e)
    }
  }

  async function refresh(e?: any) {
    const { value: user_id } = await Preferences.get({ key: LocalStorage.user })
    if (!user_id) return
    user.value = await api.getUser({ _id: user_id })
    checkPreferenceConsistency(user.value!)
    await getInbox()
    if (e) e.target.complete()
  }

  async function setNotifications(token: string | undefined) {
    localSubscription.value = token

    if (!user.value) return
    if (!token) await api.unsubscribe({ _id: user.value!._id })
    else if (token) await api.subscribe({ _id: user.value!._id, subscription: token })
    user.value!.subscription = token
  }

  function addComment(commentRes: CommentRes) {
    if (!inbox.value) return
    const index = inbox.value.findIndex(inboxItem => inboxItem._id === commentRes.inbox_item_id)
    if (index == -1) return
    inbox.value[index].comments.push(commentRes.comment)
    inbox.value[index].comments_seen_by = [
      commentRes.comment.sender == user.value!._id ? user.value!._id : user.value!.mate!._id
    ]
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

  return {
    user,
    login,
    isLoading,
    isLoggedIn,
    inbox,
    getInbox,
    unreadMessages,
    storeReady,
    setNotifications,
    addComment,
    notificationRouteLoading,
    setNotificationLoading,
    consumeNotificationLoading,
    queryParams,
    setQueryParams,
    createUser,
    localSubscription,
    localUserId,
    localUserImg,
    keyboardHeight,
    refresh,
    installPrompt,
    networkStatus,
    userDeletedError
  }
})
