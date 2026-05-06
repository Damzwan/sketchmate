import { defineStore } from 'pinia'
import { ref } from 'vue'
import { BaseMessage, PopulatedConversation } from '@/types/server.types'
import { getActiveChats, getChatMessages, markAsRead } from '@/service/api/chat.api'
import { emitSendMessage, emitTypingStatus } from '@/service/api/socket/chat.socket'
import { socket } from '@/service/api/socket/socket.service'
import { useAuthStore } from '@/store/auth.store' // <-- Import your global socket instance

export const useChatStore = defineStore('chat', () => {
  const activeChats = ref<PopulatedConversation[]>([])
  const messagesByChat = ref<Record<string, BaseMessage[]>>({})
  const typingStatuses = ref<Record<string, boolean>>({})

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
      activeChats.value.unshift(chat)
    } else {
      // If the chat didn't exist in our list (e.g. brand new chat),
      // we might need to reload chats to get the populated conversation object.
      loadActiveChats()
    }
  }

  // --- NEW SOCKET ACTIONS ---

  async function sendMessage(receiver_id: string, content: string) {
    if (!socket) throw new Error('Socket not connected')

    // Call your helper
    const response = await emitSendMessage(socket, receiver_id, content)

    if (response.success && response.message && response.conversation) {
      // Add our own message to the UI instantly
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

    // If paginating, get the timestamp of our oldest message
    const before = !isInitial && currentMessages.length > 0
      ? currentMessages[0].createdAt
      : undefined

    try {
      const history = await getChatMessages(conversationId, before)

      if (isInitial) {
        messagesByChat.value[conversationId] = history
        await markAsRead(conversationId)
      } else {
        // Prepend older messages to the start of the array
        messagesByChat.value[conversationId] = [...history, ...currentMessages]
      }

      return history.length // Return count to check if we reached the end
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
    loadMessages
  }
})