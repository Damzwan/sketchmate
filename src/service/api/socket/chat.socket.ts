import { Socket } from 'socket.io-client'
import { useFriendStore } from '@/store/friend.store'
import { useChatStore } from '@/store/chat.store' // Added this
import { BaseMessage, PopulatedConversation } from '@/types/server.types'

export function registerChatHandlers(socket: Socket) {
  const friendStore = useFriendStore()
  const chatStore = useChatStore()

  // --- SOCIAL STATUS ---
  socket.on('friend:online', (payload: { user_id: string }) => {
    friendStore.setFriendOnlineStatus(payload.user_id, true)
  })

  socket.on('friend:offline', (payload: { user_id: string }) => {
    friendStore.setFriendOnlineStatus(payload.user_id, false)
  })

  // --- INCOMING MESSAGES ---
  socket.on('chat:receive_message', (payload: {
    message: BaseMessage,
    conversation: PopulatedConversation,
    conversation_id: string
  }) => {
    console.log('New message received:', payload.message.content)
    // This updates the message list and bumps the conversation to the top
    chatStore.addIncomingMessage(payload.conversation_id, payload.message)
  })

  // --- TYPING STATUS ---
  socket.on('chat:typing_status', (payload: {
    sender_id: string,
    is_typing: boolean
  }) => {
    // This triggers the "typing..." indicator in your ChatHeader and List
    chatStore.setTypingStatus(payload.sender_id, payload.is_typing)
  })
}

// --- EMIT HELPERS ---

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