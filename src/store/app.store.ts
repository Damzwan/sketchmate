// Utilities
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { CommentRes, InboxItem, NotificationType, User } from '@/types/server.types'
import { useSocketService } from '@/service/socket.service'
import { getUser } from '@/helper/app.helper'
import { useAPI } from '@/service/api.service'
import { Storage } from '@/types/storage.types'

export const useAppStore = defineStore('app', () => {
  const user = ref<User>()
  const inbox = ref<InboxItem[]>()

  const isLoggedIn = ref(false)
  const isLoading = ref(true)
  const notificationRouteLoading = ref<NotificationType>()
  const storeReady = ref(false)

  const unreadMsg = localStorage.getItem(Storage.unread)
  const unreadMessages = ref(unreadMsg ? parseInt(unreadMsg) : 0)

  const error = ref()
  const api = useAPI()

  const queryParams = ref<URLSearchParams>()

  async function login() {
    try {
      user.value = await getUser()
      const socketService = useSocketService()
      await socketService.login({ _id: user.value!._id })
      isLoading.value = false
      isLoggedIn.value = true
    } catch (e) {
      error.value = e
    }
  }

  async function getInbox() {
    try {
      if (user.value!.inbox.length === 0) {
        inbox.value = []
        return
      }
      isLoading.value = true
      const retrievedInbox = await api.getInbox({
        _ids: user.value!.inbox
      })
      isLoading.value = false
      if (!retrievedInbox) throw new Error()
      inbox.value = retrievedInbox
    } catch (e) {
      error.value = e
    }
  }

  function increaseUnreadMessages() {
    // if (route.path === `/${FRONTEND_ROUTES.gallery}`) return
    // unreadMessages.value += 1
    // localStorage.setItem(Storage.unread, unreadMessages.value.toString())
  }

  function cleanUnreadMessages() {
    unreadMessages.value = 0
    localStorage.setItem(Storage.unread, '0')
  }

  function setNotifications(token: string | undefined) {
    user.value!.subscription = token
    if (!token) api.unsubscribe({ _id: user.value!._id })
    else api.subscribe({ _id: user.value!._id, subscription: token })
  }

  function addComment(commentRes: CommentRes) {
    if (!inbox.value) return
    const index = inbox.value.findIndex(inboxItem => inboxItem._id === commentRes.inbox_item_id)
    if (index == -1) return
    inbox.value[index].comments.push(commentRes.comment)
  }

  function setNotificationLoading(type: NotificationType) {
    notificationRouteLoading.value = type
  }

  function consumeNotificationLoading(consumeType: NotificationType) {
    if (consumeType == notificationRouteLoading.value) notificationRouteLoading.value = undefined
  }

  function setQueryParams(params: URLSearchParams | undefined) {
    queryParams.value = params
  }

  return {
    user,
    login,
    isLoading,
    error,
    isLoggedIn,
    inbox,
    getInbox,
    unreadMessages,
    increaseUnreadMessages,
    cleanUnreadMessages,
    storeReady,
    setNotifications,
    addComment,
    notificationRouteLoading,
    setNotificationLoading,
    consumeNotificationLoading,
    queryParams,
    setQueryParams
  }
})
