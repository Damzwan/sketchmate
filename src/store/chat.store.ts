import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { BaseMessage, PopulatedConversation } from '@/types/server.types'
import { getActiveChats, getChatMessages, markAsRead } from '@/service/api/chat.api'
import { emitSendMessage, emitTypingStatus } from '@/service/api/socket/chat.socket'
import { socket } from '@/service/api/socket/socket.service'
import { useAuthStore } from '@/store/auth.store'

export const useChatStore = defineStore('chat', () => {
  const activeChats = ref<PopulatedConversation[]>([])
  const messagesByChat = ref<Record<string, BaseMessage[]>>({})
  const typingStatuses = ref<Record<string, boolean>>({})
  const authStore = useAuthStore()

  const totalUnreadCount = computed(() => {
    if (!authStore.user) return 0
    const userId = authStore.user._id
    return activeChats.value.reduce((total, chat) => {
      return total + (chat.unread_counts?.[userId] || 0)
    }, 0)
  })

  async function loadActiveChats() {
    try {
      const chats = await getActiveChats()
      activeChats.value = chats as PopulatedConversation[]
    } catch (e) {
      console.error('Failed to load active chats:', e)
    }
  }

  function addIncomingMessage(conversation_id: string, message: BaseMessage) {
    if (!messagesByChat.value[conversation_id]) {
      messagesByChat.value[conversation_id] = []
    }
    messagesByChat.value[conversation_id].push(message)

    const chatIndex = activeChats.value.findIndex(c => c._id === conversation_id)
    if (chatIndex > -1) {
      const [chat] = activeChats.value.splice(chatIndex, 1)
      chat.last_message = message
      chat.updatedAt = message.createdAt

      // DYNAMIC UPDATE: Increment local unread count if we didn't send it
      if (authStore.user && message.sender_id !== authStore.user._id) {
        if (!chat.unread_counts) chat.unread_counts = {}
        chat.unread_counts[authStore.user._id] = (chat.unread_counts[authStore.user._id] || 0) + 1
      }

      activeChats.value.unshift(chat)
    } else {
      loadActiveChats()
    }
  }

  async function sendMessage(receiver_id: string, content: string) {
    if (!socket) throw new Error('Socket not connected')

    const response = await emitSendMessage(socket, receiver_id, content)

    if (response.success && response.message && response.conversation) {
      addIncomingMessage(response.conversation._id, response.message)
      return response
    }
    throw new Error('Failed to send message')
  }

  function sendTypingIndicator(receiver_id: string, is_typing: boolean) {
    if (socket) {
      emitTypingStatus(socket, receiver_id, is_typing)
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

    // Already loaded — just mark as read and return
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
    totalUnreadCount
  }
})