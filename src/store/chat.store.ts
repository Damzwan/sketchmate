import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { BaseMessage, PopulatedConversation } from '@/types/server.types'
import { getActiveChats, getChatMessages, markAsRead, respondToChatRequest } from '@/service/api/chat.api'
import { emitSendMessage, emitTypingStatus } from '@/service/api/socket/chat.socket'
import { socket } from '@/service/api/socket/socket.service'
import { useAuthStore } from '@/store/auth.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useFriendStore } from '@/store/friend.store'
import { v4 as uuidv4 } from 'uuid'

type FrontendMessage = BaseMessage & {
  isOptimistic?: boolean
  localKey?: string
}


export const useChatStore = defineStore('chat', () => {
  const activeChats = ref<PopulatedConversation[]>([])
  const messagesByChat = ref<Record<string, FrontendMessage[]>>({})
  const typingStatuses = ref<Record<string, boolean>>({})
  const authStore = useAuthStore()
  const notifications = ref<any[]>([])
  const hasMoreMessagesByChat = ref<Record<string, boolean>>({})

  // --- COMPUTED ---

  const totalUnreadCount = computed(() => {
    if (!authStore.user) return 0
    const userId = authStore.user._id
    const friendStore = useFriendStore()

    const activeSum = activeChats.value.reduce((total, chat) => total + (chat.unread_counts?.[userId] || 0), 0)
    const pendingSum = friendStore.pendingRequests.reduce((total, chat) => total + (chat.unread_counts?.[userId] || 0), 0)

    return activeSum + pendingSum
  })

  const canSendMessage = computed(() => (tabId: string) => {
    if (tabId === 'lobby' || tabId === 'overview') return true
    const me = authStore.user?._id
    if (!me) return false

    const friendStore = useFriendStore()
    const chat = activeChats.value.find(c => c._id === tabId) || friendStore.pendingRequests.find(c => c._id === tabId)

    if (chat?.status === 'expired') return false
    if (!chat) return true
    if (chat.status === 'pending') return false

    if (chat.status === 'temporary' && chat.trial_expires_at) {
      if (dayjs().isAfter(dayjs(chat.trial_expires_at))) return false
    }

    return true
  })

  const chatInputPlaceholder = computed(() => (tabId: string) => {
    if (tabId === 'lobby') return 'Sketch a message...'

    const me = authStore.user?._id
    const friendStore = useFriendStore()
    const chat = activeChats.value.find(c => c._id === tabId) || friendStore.pendingRequests.find(c => c._id === tabId)

    if (chat) {
      if (chat.status === 'pending') {
        return chat.initiator_id === me ? 'Waiting for response...' : 'Accept request to reply...'
      }
      if (chat.status === 'expired') return 'Chat locked. Re-match to continue.'
      if (chat.status === 'temporary' && chat.trial_expires_at) {
        if (dayjs().isAfter(dayjs(chat.trial_expires_at))) return 'Trial ended. Send Mate request!'
        const hoursLeft = dayjs(chat.trial_expires_at).diff(dayjs(), 'hour')
        return hoursLeft > 0 ? `Message... (${hoursLeft}h trial left)` : 'Message... (Trial ending soon)'
      }
    }

    return 'Write a message...'
  })

  const isMate = computed(() => (tabId: string) => {
    const chat = activeChats.value.find(c => c._id === tabId)
    return chat?.status === 'active'
  })

  const mateRequestStatus = computed(() => (tabId: string) => {
    const me = authStore.user?._id
    const chat = activeChats.value.find(c => c._id === tabId)
    if (chat?.status !== 'mate_pending') return null
    return chat.initiator_id === me ? 'sent' : 'received'
  })

  // --- ACTIONS ---

  async function loadActiveChats() {
    try {
      const chats = await getActiveChats()
      activeChats.value = chats as PopulatedConversation[]
    } catch (e) {
      console.error('Failed to load active chats:', e)
    }
  }

  function addIncomingMessage(
    conversation_id: string,
    message: BaseMessage,
    fullConversation?: PopulatedConversation
  ) {
    // 1. Filter out system status strings to keep bubbles clean
    const systemStrings = [
      'Sent a Mate proposal! 💖',
      'Sent a new Mate proposal! Let\'s try again? 🎨',
      'SYSTEM_MATE_REQUEST'
    ] // TODO should not be necessary
    if (systemStrings.includes(message.content)) return

    if (!messagesByChat.value[conversation_id]) {
      messagesByChat.value[conversation_id] = []
    }

    if (!messagesByChat.value[conversation_id].some(m => m._id === message._id)) {
      messagesByChat.value[conversation_id].push(message)
    }

    const friendStore = useFriendStore()

    const updateConv = (chat: PopulatedConversation) => {
      chat.last_message = message
      chat.updatedAt = message.createdAt

      if (fullConversation) {
        chat.status = fullConversation.status
        chat.trial_expires_at = fullConversation.trial_expires_at
        chat.unread_counts = fullConversation.unread_counts
        chat.initiator_id = fullConversation.initiator_id
        chat.cooldown_until = fullConversation.cooldown_until

        const hasPopulatedParticipants = fullConversation.participants?.some(p => typeof p === 'object' && p.name)
        if (hasPopulatedParticipants) {
          chat.participants = fullConversation.participants
        }
      }
    }

    const activeIdx = activeChats.value.findIndex(c => c._id === conversation_id)
    const pendingIdx = friendStore.pendingRequests.findIndex(c => c._id === conversation_id)

    if (activeIdx > -1) {
      const [chat] = activeChats.value.splice(activeIdx, 1)
      updateConv(chat)
      activeChats.value.unshift(chat)
    } else if (pendingIdx > -1) {
      const [chat] = friendStore.pendingRequests.splice(pendingIdx, 1)
      updateConv(chat)
      if (chat.status !== 'pending') {
        activeChats.value.unshift(chat)
      } else {
        friendStore.pendingRequests.unshift(chat)
      }
    } else if (fullConversation) {
      if (fullConversation.status === 'pending') {
        friendStore.pendingRequests.unshift(fullConversation)
      } else {
        activeChats.value.unshift(fullConversation)
      }
    }
  }

  async function respondToRequest(conversationId: string, action: 'accept' | 'decline') {
    try {
      const response = await respondToChatRequest(conversationId, action) as any
      const friendStore = useFriendStore()
      const widgetStore = useChatWidgetStore()

      if (action === 'accept') {
        const chat = friendStore.pendingRequests.find(c => c._id === conversationId)
        if (chat) {
          chat.status = 'temporary'
          chat.trial_expires_at = response.trial_expires_at
          activeChats.value.unshift(chat)
        }
      } else {
        widgetStore.removeChatHead(conversationId)
        if (widgetStore.activeTab === conversationId) {
          widgetStore.activeTab = 'overview'
        }
      }

      friendStore.pendingRequests = friendStore.pendingRequests.filter(c => c._id !== conversationId)
    } catch (e) {
      console.error('Failed to respond to request', e)
    }
  }

  function addOptimisticMessage(chatId: string, message: any) {
    if (!messagesByChat.value[chatId]) {
      messagesByChat.value[chatId] = []
    }
    // Push the temp message so it renders immediately
    messagesByChat.value[chatId].push(message)
  }

  function resolveOptimisticMessage(chatId: string, tempId: string, resolvedMessage: any, actualConversationId?: string) {
    const targetId = actualConversationId || chatId

    // Ensure the target array exists
    if (!messagesByChat.value[targetId]) {
      messagesByChat.value[targetId] = []
    }

    const chatMessages = messagesByChat.value[chatId]
    if (!chatMessages) return

    const index = chatMessages.findIndex((msg) => msg._id === tempId)
    if (index !== -1) {
      // Transfer the stable key to the new message
      resolvedMessage.localKey = chatMessages[index].localKey || tempId

      // RACE CONDITION CHECK: Did the socket already push the real message?
      const targetArray = messagesByChat.value[targetId]
      const duplicateIndex = targetArray.findIndex(m => m._id === resolvedMessage._id)

      if (duplicateIndex !== -1 && targetArray[duplicateIndex]._id !== tempId) {
        // The socket already added the official message!
        // 1. Remove our temporary one
        chatMessages.splice(index, 1)
        // 2. Make sure the socket-added one has the UI state we need
        targetArray[duplicateIndex].status = 'sent'
        targetArray[duplicateIndex].localKey = resolvedMessage.localKey
        targetArray[duplicateIndex].isOptimistic = true
      } else {
        // Normal Flow (HTTP won the race)
        if (actualConversationId && actualConversationId !== chatId) {
          // Move to the new conversation ID array
          chatMessages.splice(index, 1)
          messagesByChat.value[targetId].push(resolvedMessage)
        } else {
          // Swap out the temp message for the real one in place smoothly
          chatMessages.splice(index, 1, resolvedMessage)
        }
      }
    }
  }

  function updateMessageStatus(chatId: string, tempId: string, status: 'sending' | 'sent' | 'error') {
    const chatMessages = messagesByChat.value[chatId]
    if (!chatMessages) return

    const message = chatMessages.find((msg) => msg._id === tempId)
    if (message) {
      message.status = status
    }
  }

  async function sendMessage(receiver_id: string, content: string, chat_id: string) {
    if (!socket) throw new Error('Socket not connected')

    const chatWidget = useChatWidgetStore()

    // 1. Create a temporary Optimistic Message WITH a stable localKey
    const tempId = uuidv4()
    const optimisticMessage = {
      _id: tempId,
      localKey: tempId, // <-- ADD THIS: It will never change
      content,
      sender_id: authStore.user?._id,
      createdAt: new Date().toISOString(),
      status: 'sending',
      isOptimistic: true
    }

    // 2. Inject immediately
    addOptimisticMessage(chat_id, optimisticMessage)

    try {
      // 3. Emit to server
      const response = await emitSendMessage(socket, receiver_id, content)

      if (response.success && response.message && response.conversation) {
        const convId = response.conversation._id

        // 4. Resolve the message, passing the localKey forward
        resolveOptimisticMessage(chat_id, tempId, {
          ...response.message,
          localKey: tempId, // <-- ADD THIS: Keep the same key on the resolved message
          status: 'sent',
          isOptimistic: true
        }, convId)

        // 5. Update UI Tabs
        if (chatWidget.activeTab === receiver_id) {
          chatWidget.addChatHead(convId, 'chat')
          chatWidget.activeTab = convId
          if (receiver_id !== convId) {
            chatWidget.removeChatHead(receiver_id)
          }
        }
        return response
      }
    } catch (error) {
      updateMessageStatus(chat_id, tempId, 'error')
      throw new Error('Failed to send message')
    }
  }

  function setTypingStatus(sender_id: string, is_typing: boolean) {
    typingStatuses.value[sender_id] = is_typing
    if (is_typing) {
      setTimeout(() => {
        if (typingStatuses.value[sender_id]) typingStatuses.value[sender_id] = false
      }, 3000)
    }
  }

  async function loadMessages(conversationId: string, isInitial = true) {
    const currentMessages = messagesByChat.value[conversationId] || []

    if (isInitial && currentMessages.length > 0) {
      markAsRead(conversationId)
      const chat = activeChats.value.find(c => c._id === conversationId)
      if (chat && authStore.user) {
        if (!chat.unread_counts) chat.unread_counts = {}
        chat.unread_counts[authStore.user._id] = 0
      }
      return currentMessages.length
    }

    const before = !isInitial && currentMessages.length > 0 ? currentMessages[0].createdAt : undefined

    try {
      const history = await getChatMessages(conversationId, before)

      // NEW: Track if there are more messages available to fetch (assuming your backend limit is 50)
      hasMoreMessagesByChat.value[conversationId] = history.length === 50

      if (isInitial) {
        messagesByChat.value[conversationId] = history
        await markAsRead(conversationId)
        const chat = activeChats.value.find(c => c._id === conversationId)
        if (chat && authStore.user) {
          if (!chat.unread_counts) chat.unread_counts = {}
          chat.unread_counts[authStore.user._id] = 0
        }
      } else {
        messagesByChat.value[conversationId] = [...history, ...currentMessages]
      }
      return history.length
    } catch (e) {
      console.error('History sync failed:', e)
      return 0
    }
  }

  function addNotification(notif: {
    tabId: string,
    subtitle: string,
    text: string,
    isMateProposal?: boolean,
    img: string,
    isTrial?: boolean,
    isRequest?: boolean
  }) {
    const chatWidget = useChatWidgetStore()
    if (chatWidget.isExpanded && chatWidget.activeTab === notif.tabId) return

    const existing = notifications.value.find(n => n.tabId === notif.tabId)
    if (existing) {
      existing.lines.push({ id: Date.now(), text: notif.text })
      if (existing.lines.length > 2) existing.lines.shift()
      clearTimeout(existing.timer)
      existing.timer = setTimeout(() => removeNotification(notif.tabId), 8000)
    } else {
      const newGroup = {
        ...notif,
        lines: [{ id: Date.now(), text: notif.text }],
        timer: setTimeout(() => removeNotification(notif.tabId), 8000)
      }
      notifications.value.push(newGroup)
    }
  }

  function removeNotification(tabId: string) {
    notifications.value = notifications.value.filter(n => n.tabId !== tabId)
  }

  // --- SOCKET HANDLERS ---

  function handleRequestAccepted(payload: { conversation: PopulatedConversation }) {
    const friendStore = useFriendStore()
    friendStore.pendingRequests = friendStore.pendingRequests.filter(c => c._id !== payload.conversation._id)
    if (!activeChats.value.some(c => c._id === payload.conversation._id)) {
      activeChats.value.unshift(payload.conversation)
    }
    const partner = payload.conversation.participants.find(p => p._id !== authStore.user?._id)
    addNotification({
      tabId: payload.conversation._id,
      subtitle: partner?.name || 'Sketchmate',
      text: 'Accepted your request! You have 24h to vibe.',
      img: partner?.img || '',
      isTrial: true
    })
  }

  function handleRequestDeclined(payload: { conversation_id: string }) {
    const friendStore = useFriendStore()
    const widgetStore = useChatWidgetStore()
    activeChats.value = activeChats.value.filter(c => c._id !== payload.conversation_id)
    friendStore.pendingRequests = friendStore.pendingRequests.filter(c => c._id !== payload.conversation_id)
    if (widgetStore.activeTab === payload.conversation_id) {
      widgetStore.activeTab = 'overview'
      widgetStore.removeChatHead(payload.conversation_id)
    }
  }

  function handleMateMatched(payload: { conversation: PopulatedConversation }) {
    const friendStore = useFriendStore()
    const index = activeChats.value.findIndex(c => c._id === payload.conversation._id)

    if (index !== -1) {
      activeChats.value[index] = {
        ...activeChats.value[index],
        ...payload.conversation,
        status: 'active'
      }
    }

    const partner = payload.conversation.participants.find(p => p._id !== authStore.user?._id)
    if (partner) {
      friendStore.addFriendLocally(partner)
    }

    addNotification({
      tabId: payload.conversation._id,
      subtitle: 'New Mate!',
      text: `You and ${partner?.name} are now Mates forever! 🎨✨`,
      img: partner?.img || '',
      isMateProposal: true
    })
  }

  function sendTypingIndicator(receiver_id: string, is_typing: boolean) {
    if (socket) emitTypingStatus(socket, receiver_id, is_typing)
  }

  function handleMateDeclined(payload: {
    conversation_id: string,
    conversation: PopulatedConversation,
    status: 'temporary' | 'expired'
  }) {
    const index = activeChats.value.findIndex(c => c._id === payload.conversation_id)

    if (index !== -1) {
      activeChats.value[index] = {
        ...activeChats.value[index],
        ...payload.conversation,
        status: payload.status,
        initiator_id: undefined
      }
    }

    const partner = payload.conversation.participants.find(p => p._id !== authStore.user?._id)
    const isExpired = payload.status === 'expired'

    addNotification({
      tabId: payload.conversation_id,
      subtitle: 'Proposal Update',
      text: isExpired
        ? `${partner?.name} isn't ready to re-match yet.`
        : `${partner?.name} wants to stay in the trial phase.`,
      img: partner?.img || '',
      isTrial: !isExpired,
      isRequest: false
    })
  }

  function handleMateUnfriended(payload: {
    conversation_id: string,
    conversation: PopulatedConversation
  }) {
    const friendStore = useFriendStore()
    const authStore = useAuthStore()
    const partner = payload.conversation.participants.find(p => p._id !== authStore.user?._id)

    // Optimistic: We do NOT remove locally to preserve history access
    const index = activeChats.value.findIndex(c => c._id === payload.conversation_id)
    if (index !== -1) {
      activeChats.value[index] = {
        ...activeChats.value[index],
        ...payload.conversation,
        status: 'expired'
      }
    } else {
      activeChats.value.unshift(payload.conversation)
    }

    addNotification({
      tabId: payload.conversation_id,
      subtitle: 'Connection Ended',
      text: `Matership with ${partner?.name || 'Artist'} has ended.`,
      img: partner?.img || '',
      isTrial: false
    })
  }

  function handleMateRequested(payload: {
    conversation_id: string,
    conversation: PopulatedConversation,
    wasExpired: boolean
  }) {
    const index = activeChats.value.findIndex(c => c._id === payload.conversation_id)

    if (index !== -1) {
      activeChats.value[index] = {
        ...activeChats.value[index],
        ...payload.conversation,
        status: 'mate_pending'
      }
    } else {
      activeChats.value.unshift(payload.conversation)
    }

    const partner = payload.conversation.participants.find(p => p._id !== authStore.user?._id)
    addNotification({
      tabId: payload.conversation_id,
      subtitle: partner?.name || 'New Request',
      text: payload.wasExpired ? 'Wants to re-match as Mates! 🎨' : 'Wants to be Mates! 💖',
      img: partner?.img || '',
      isMateProposal: true
    })

    const widgetStore = useChatWidgetStore()
    widgetStore.triggerNewMessageAlert(payload.conversation_id)
  }

  return {
    activeChats,
    messagesByChat,
    typingStatuses,
    loadActiveChats,
    addIncomingMessage,
    setTypingStatus,
    sendMessage,
    sendTypingIndicator,
    loadMessages,
    totalUnreadCount,
    canSendMessage,
    chatInputPlaceholder,
    respondToRequest,
    handleRequestAccepted,
    handleRequestDeclined,
    addNotification,
    removeNotification,
    notifications,
    isMate,
    mateRequestStatus,
    handleMateMatched,
    handleMateDeclined,
    handleMateUnfriended,
    handleMateRequested,
    hasMoreMessagesByChat
  }
})