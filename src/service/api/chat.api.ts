import { request } from './http'
import { BaseMessage, PopulatedConversation } from '@/types/server.types'

export async function getActiveChats() {
  return await request<PopulatedConversation[]>('/chats/active')
}

export async function getPendingRequests() {
  return await request<PopulatedConversation[]>('/chats/requests')
}


export async function getChatMessages(conversationId: string, before?: string, limit = 30): Promise<any> {
  let url = `/chats/${conversationId}/messages?limit=${limit}`
  if (before) url += `&before=${before}`
  return await request<BaseMessage[]>(url)
}

export async function markAsRead(conversationId: string): Promise<void> {
  return await request<void>(`/chats/${conversationId}/read`, {
    method: 'POST'
  })
}

export async function respondToChatRequest(conversationId: string, action: 'accept' | 'decline') {
  return await request(`/chats/${conversationId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action })
  })
}

export async function requestMatership(conversationId: string) {
  return await request(`/chats/${conversationId}/mate-request`, {
    method: 'POST'
  })
}


export async function acceptMatership(conversationId: string) {
  return await request(`/chats/${conversationId}/mate-accept`, {
    method: 'POST'
  })
}

export async function declineMatership(conversationId: string) {
  return await request(`/chats/${conversationId}/mate-decline`, {
    method: 'POST'
  })
}