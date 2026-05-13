import { request } from './http'
import { BaseMessage, PopulatedConversation } from '@/types/server.types'

/**
 * Returns active mates + temporary 24h chats.
 * Backend logic should now filter conversations based on the
 * chat_status in the linked relationship document.
 */
export async function getActiveChats() {
  return await request<PopulatedConversation[]>('/chats/active')
}

/**
 * UPDATED: Fetches conversations where the relationship status is 'pending_invite'.
 * This is the "Message Request" folder.
 */
export async function getPendingRequests() {
  return await request<PopulatedConversation[]>('/chats/requests')
}

/**
 * Standard message history fetcher.
 */
export async function getChatMessages(conversationId: string, before?: string, limit = 30) {
  let url = `/chats/${conversationId}/messages?limit=${limit}`
  if (before) url += `&before=${before}`

  return await request<BaseMessage[]>(url)
}

/**
 * Simple POST to clear unread counts for the current user.
 */
export async function markAsRead(conversationId: string): Promise<void> {
  return await request<void>(`/chats/${conversationId}/read`, {
    method: 'POST'
  })
}