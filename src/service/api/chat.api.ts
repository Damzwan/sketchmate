import { request } from './http'
import { BaseMessage, PopulatedConversation } from '@/types/server.types'

export async function getActiveChats() {
  return await request<PopulatedConversation[]>('/chats/active')
}

export async function getPendingRequests() {
  return await request<PopulatedConversation[]>('/chats/requests')
}


export async function getChatMessages(conversationId: string, before?: string): Promise<BaseMessage[]> {
  const url = before
    ? `/chats/${conversationId}/messages?before=${before}`
    : `/chats/${conversationId}/messages`
  return await request<BaseMessage[]>(url)
}

export async function markAsRead(conversationId: string): Promise<void> {
  return await request<void>(`/chats/${conversationId}/read`, {
    method: 'POST'
  })
}