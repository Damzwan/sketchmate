import { request } from './http'
import { User, Mate, FeedPost, UserProfileData } from '@/types/server.types'

export async function toggleFollow(targetId: string) {
  return await request(`/user/follow/${targetId}`, { method: 'PUT' })
}

export async function searchUsers(query: string) {
  return await request<Mate[]>(`/user/search_mate?mateName=${query}`)
}

export async function reportUserContent(targetId: string, type: 'post' | 'comment', reason: string) {
  return await request('/report', {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId, target_type: type, reason })
  })
}

export async function fetchUserPosts(userId: string, page = 1, limit = 20) {
  return await request<{ posts: FeedPost[] }>(
    `/user/${userId}/posts?page=${page}&limit=${limit}`
  )
}

export interface UpdateProfileParams {
  name: string;
  description: string;
}

export async function updateProfile(params: UpdateProfileParams) {
  return await request('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

export async function uploadProfileImg(blob: Blob, previousImageUrl?: string) {
  const formData = new FormData();
  formData.append('img', blob, 'profile.webp');
  if (previousImageUrl) {
    formData.append('previousImage', previousImageUrl);
  }

  return await request<{ url: string }>('/user/upload-image', {
    method: 'POST',
    body: formData
  });
}

export async function blockUser(blockId: string) {
  return await request('/user/block', {
    method: 'POST',
    body: JSON.stringify({ block_id: blockId })
  })
}

export async function unblockUser(blockId: string) {
  return await request('/user/unblock', {
    method: 'POST',
    body: JSON.stringify({ block_id: blockId })
  })
}


export async function fetchOnlineFriends() {
  return await request<string[]>('/user/online-friends'); // Adjust path to match your Koa prefix
}

export async function fetchUserProfile(userId: string) {
  return await request<UserProfileData>(`/user/${userId}/profile`);
}

export async function unfriendUser(targetId: string) {
  return await request(`/user/unfriend/${targetId}`, { method: 'PUT' });
}