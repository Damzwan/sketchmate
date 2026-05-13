import { Socket } from 'socket.io-client'
import { useFriendStore } from '@/store/friend.store'
import { useChatStore } from '@/store/chat.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useAuthStore } from '@/store/auth.store'
import { BaseMessage, PopulatedConversation, ChatStatus } from '@/types/server.types'

/**
 * registerChatHandlers
 * Centralizes all real-time chat and relationship socket events.
 */
export function registerChatHandlers(socket: Socket) {
  const friendStore = useFriendStore()
  const chatStore = useChatStore()
  const widgetStore = useChatWidgetStore()
  const authStore = useAuthStore()

  socket.on('friend:online', (payload: { user_id: string }) => {
    friendStore.setFriendOnlineStatus(payload.user_id, true)
  })

  socket.on('friend:offline', (payload: { user_id: string }) => {
    friendStore.setFriendOnlineStatus(payload.user_id, false)
  })

  socket.on('chat:receive_message', (payload: {
    message: BaseMessage,
    conversation: PopulatedConversation,
    conversation_id: string
  }) => {
    const me = authStore.user?._id
    if (payload.message.sender_id === me) return

    // 1. Sync store data (Handles hydration for new or status-changing chats)
    chatStore.addIncomingMessage(payload.conversation_id, payload.message, payload.conversation)

    // 2. Trigger UI alerts (Chat heads/Animations)
    widgetStore.triggerNewMessageAlert(payload.conversation_id)

    // 3. Show Notification Toast if the message isn't from the current user
    if (payload.message.sender_id !== me) {
      const partner = payload.conversation.participants.find(p => p._id !== me)

      chatStore.addNotification({
        tabId: payload.conversation_id,
        subtitle: partner?.name || 'New Message',
        text: payload.message.content || 'Sent a sketch',
        img: partner?.img || '',
        // FIX: Updated to match standardized ChatStatus literals
        isTrial: payload.conversation.status === 'temporary',
        isRequest: payload.conversation.status === 'pending_invite',
        isMateProposal: payload.conversation.status === 'pending_mate'
      })
    }
  })

  socket.on('chat:typing_status', (payload: { sender_id: string, is_typing: boolean }) => {
    chatStore.setTypingStatus(payload.sender_id, payload.is_typing)
  })

  socket.on('chat:request_accepted', (payload: { conversation: PopulatedConversation }) => {
    chatStore.handleRequestAccepted(payload)
  })

  socket.on('chat:request_declined', (payload: { conversation_id: string }) => {
    chatStore.handleRequestDeclined(payload)
  })

  socket.on('chat:mate_matched', (payload: { conversation: PopulatedConversation }) => {
    chatStore.handleMateMatched(payload)
  })

  socket.on('chat:mate_declined', (payload: {
    conversation_id: string,
    conversation: PopulatedConversation,
    status: ChatStatus // FIX: Aligned with the chatStore method signature
  }) => {
    chatStore.handleMateDeclined(payload)
  })

  socket.on('chat:mate_unfriended', (payload: {
    conversation_id: string,
    conversation: PopulatedConversation
  }) => {
    chatStore.handleMateUnfriended(payload)
    // Clear friend from friendStore list locally
    const me = authStore.user?._id
    const partner = payload.conversation.participants.find(p => p._id !== me)
    if (partner) friendStore.removeFriendLocally(partner._id)
  })

  socket.on('chat:mate_requested', (payload: {
    conversation_id: string,
    conversation: PopulatedConversation,
    wasExpired: boolean
  }) => {
    chatStore.handleMateRequested(payload)
  })
}

/**
 * Sends a message and returns the server's acknowledgment (with the real DB _id)
 */
export function emitSendMessage(socket: any, receiver_id: string, content: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Socket disconnected'))

    socket.emit('chat:send_message', { receiver_id, content }, (response: any) => {
      if (response.error) {
        reject(new Error(response.error))
      } else {
        resolve(response)
      }
    })
  })
}

/**
 * Throttled typing indicator emit
 */
export function emitTypingStatus(socket: any, receiver_id: string, is_typing: boolean) {
  if (socket?.connected) {
    socket.emit('chat:typing', { receiver_id, is_typing })
  }
}