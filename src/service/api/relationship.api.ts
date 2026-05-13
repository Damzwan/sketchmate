import { request } from './http'
import { NetworkUser, ChatStatus } from '@/types/server.types'

// --- FOLLOW & NETWORK ---

/**
 * Toggles follow state.
 * Returns { isFollowing: boolean }
 */
export async function toggleFollow(targetId: string) {
  return await request<{ isFollowing: boolean }>(`/relationship/follow/${targetId}`, {
    method: 'PUT'
  })
}

/**
 * Fetches specific lists (Mates, Following, Followers, Blocked)
 * Returns hydrated NetworkUser objects including their relationship status.
 */
export async function fetchNetworkType(
  userId: string,
  type: 'mates' | 'following' | 'followers' | 'blocked',
  params: { page?: number; limit?: number; search?: string }
) {
  const query = new URLSearchParams({
    page: (params.page || 1).toString(),
    limit: (params.limit || 20).toString(),
    ...(params.search && { search: params.search })
  })

  return await request<NetworkUser[]>(`/relationship/${userId}/network/${type}?${query.toString()}`)
}

// --- BLOCKING & UNFRIENDING ---

/**
 * Ends a trial or permanent matership.
 * Moves status to 'expired' and sets a cooldown.
 */
export async function unfriendUser(targetId: string) {
  return await request<{ success: boolean }>(`/relationship/unfriend/${targetId}`, {
    method: 'PUT'
  })
}

/**
 * Blocks a user, clearing all follow/mate relationships.
 */
export async function blockUser(targetId: string) {
  return await request<{ success: boolean }>('/relationship/block', {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId })
  })
}

/**
 * Removes a block, resetting the relationship to 'none'.
 */
export async function unblockUser(targetId: string) {
  return await request<{ success: boolean }>('/relationship/unblock', {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId })
  })
}

// --- MATE UPGRADE PIPELINE (The 24h Trial) ---

/**
 * Initiates an upgrade request from 'temporary' to 'mate'.
 */
export async function requestMatership(conversationId: string) {
  return await request(`/relationship/${conversationId}/mate-request`, {
    method: 'POST'
  })
}

/**
 * Accepts a 'pending_mate' request, making the connection permanent.
 */
export async function acceptMatership(relationshipId: string) {
  return await request(`/relationship/${relationshipId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action: 'accept' })
  })
}

/**
 * Declines a 'pending_mate' request.
 */
export async function declineMatership(relationshipId: string) {
  return await request(`/relationship/${relationshipId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action: 'decline' })
  })
}

/**
 * Returns a simple string array of blocked User IDs for the local Set.
 */
export async function getBlockedIds() {
  return await request<string[]>(`/relationship/blocked-ids`)
}

export async function respondToRelationship(relationshipId: string, action: 'accept' | 'decline') {
  return await request(`/relationship/${relationshipId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action: action })
  })
}