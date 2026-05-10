import { Socket } from 'socket.io-client'
import { useFriendStore } from '@/store/friend.store'
import { useChatStore } from '@/store/chat.store'
import { BaseMessage, PopulatedConversation } from '@/types/server.types'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useAuthStore } from '@/store/auth.store'

/**
 * registerChatHandlers
 * Centralizes all real-time chat and relationship socket events.
 */
export function registerChatHandlers(socket: Socket) {
  const friendStore = useFriendStore()
  const chatStore = useChatStore()
  const widgetStore = useChatWidgetStore()
  const authStore = useAuthStore()

  // --- 1. SOCIAL STATUS ---
  socket.on('friend:online', (payload: { user_id: string }) => {
    friendStore.setFriendOnlineStatus(payload.user_id, true)
  })

  socket.on('friend:offline', (payload: { user_id: string }) => {
    friendStore.setFriendOnlineStatus(payload.user_id, false)
  })

  // --- 2. INCOMING MESSAGES & SYSTEM UPDATES ---
  socket.on('chat:receive_message', (payload: {
    message: BaseMessage,
    conversation: PopulatedConversation,
    conversation_id: string
  }) => {
    // Sync store data (Handles hydration for new or status-changing chats)
    chatStore.addIncomingMessage(payload.conversation_id, payload.message, payload.conversation)

    // Trigger UI animations/alerts
    widgetStore.triggerNewMessageAlert(payload.conversation_id)

    // Show Toast if the message isn't from the current user
    const me = authStore.user?._id
    if (payload.message.sender_id !== me) {
      const partner = payload.conversation.participants.find(p => p._id !== me)

      chatStore.addNotification({
        tabId: payload.conversation_id,
        subtitle: partner?.name || 'New Message',
        text: payload.message.content || 'Sent a sketch',
        img: partner?.img || '',
        isTrial: payload.conversation.status === 'temporary',
        isRequest: payload.conversation.status === 'pending',
        isMateProposal: payload.conversation.status === 'mate_pending'
      })
    }
  })

  // --- 3. TYPING INDICATORS ---
  socket.on('chat:typing_status', (payload: { sender_id: string, is_typing: boolean }) => {
    chatStore.setTypingStatus(payload.sender_id, payload.is_typing)
  })

  // --- 4. RELATIONSHIP LIFECYCLE ---

  // Trial started: Move from 'Pending' list to 'Active' list
  socket.on('chat:request_accepted', (payload: { conversation: PopulatedConversation }) => {
    chatStore.handleRequestAccepted(payload)
  })

  // Initial Request Declined: Remove the chat head and pending entry
  socket.on('chat:request_declined', (payload: { conversation_id: string }) => {
    chatStore.handleRequestDeclined(payload)
  })

  // Mate Request Accepted: Permanent unlock + Social Graph update
  socket.on('chat:mate_matched', (payload: { conversation: PopulatedConversation }) => {
    chatStore.handleMateMatched(payload)
  })

  socket.on('chat:mate_declined', (payload) => chatStore.handleMateDeclined(payload))

  socket.on('chat:mate_unfriended', (payload: {
    conversation_id: string,
    conversation: PopulatedConversation
  }) => {
    chatStore.handleMateUnfriended(payload);
  });

  socket.on('chat:mate_requested', (payload: {
    conversation_id: string,
    conversation: PopulatedConversation,
    wasExpired: boolean
  }) => {
    chatStore.handleMateRequested(payload);
  });
}

// --- 5. EMIT HELPERS ---

export function emitSendMessage(socket: Socket, receiver_id: string, content: string): Promise<any> {
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

export function emitTypingStatus(socket: Socket, receiver_id: string, is_typing: boolean) {
  if (socket?.connected) {
    socket.emit('chat:typing', { receiver_id, is_typing })
  }
}