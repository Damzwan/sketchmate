import { request } from './http'
import {
  ChangeUserNameParams,
  CreateEmblemParams,
  CreateSavedParams,
  CreateStickerParams,
  DeleteEmblemParams,
  DeleteProfileImgParams,
  DeleteSavedParams,
  DeleteStickerParams,
  ENDPOINTS,
  FeedPost,
  GetUserParams,
  GetUserRes,
  Mate,
  NetworkUser,
  OnLoginEventParams,
  RegisterNotificationParams,
  Res,
  Saved,
  SearchMateParams,
  UnRegisterNotificationParams,
  UpdateProfilePayload,
  UpdateUserParams
} from '@/types/server.types'
import { PublicLobby } from '@/draw/store/drawSyncing.store'

// --- PROFILE MANAGEMENT ---
export async function updateProfile(payload: UpdateProfilePayload) {
  return await request('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export async function uploadProfileImg(blob: Blob, previousImageUrl?: string, mimeType = 'image/webp') {
  const formData = new FormData()
  const extension = mimeType === 'image/gif' ? 'gif' : 'webp'

  formData.append('img', blob, `profile.${extension}`)
  if (previousImageUrl) {
    formData.append('previousImage', previousImageUrl)
  }

  return await request<{ url: string }>('/user/upload-image', {
    method: 'POST',
    body: formData
  })
}

// --- GLOBAL ACTIONS ---

export async function searchUsers(query: string) {
  return await request<Mate[]>(`/user/search?q=${encodeURIComponent(query)}`)
}

export async function fetchOnlineFriends() {
  // Returns hydrated NetworkUser objects for the "Online Now" bar
  return await request<NetworkUser[]>('/user/online-friends')
}

export async function fetchUserPosts(userId: string, page = 1, limit = 20) {
  return await request<{ posts: FeedPost[] }>(
    `/user/${userId}/posts?page=${page}&limit=${limit}`
  )
}

export async function getPartialUsers(ids: string[]): Promise<any[]> {
  if (!ids.length) return []

  const queryParams = new URLSearchParams({ _ids: ids.join(',') })

  return await request<any[]>(`/user/public_users?${queryParams.toString()}`, {
    method: 'GET'
  })
}

export async function getFullProfile(userId: string): Promise<{
  profile: any & { relationship?: any; chat_status?: string };
  posts: any[];
}> {
  return await request<{
    profile: any & { relationship?: any; chat_status?: string };
    posts: any[];
  }>(`/user/${userId}/profile`)
}

export async function createSaved(
  params: CreateSavedParams
): Promise<Res<Saved>> {
  const jsonBlob = new Blob([params.drawing], { type: 'application/json' })
  const jsonFile = new File([jsonBlob], 'drawing.json', {
    type: 'application/json'
  })
  const imgFile = new File([params.img], 'img.webp', { type: 'image/webp' })

  const data = new FormData()
  data.append('img', imgFile)
  data.append('drawing', jsonFile)

  return request<Res<Saved>>(`${ENDPOINTS.saved}/${params._id}`, {
    method: 'POST',
    body: data
  })
}

export async function deleteSaved(params: DeleteSavedParams): Promise<void> {
  const query = new URLSearchParams({
    user_id: params.user_id,
    drawing_url: params.drawing_url,
    img_url: params.img_url
  })
  return request<void>(`${ENDPOINTS.saved}?${query.toString()}`, {
    method: 'DELETE'
  })
}

export async function createSticker(
  params: CreateStickerParams
): Promise<Res<string>> {
  const data = new FormData()
  data.append('file', params.img)

  return request<Res<string>>(`${ENDPOINTS.sticker}/${params._id}`, {
    method: 'POST',
    body: data
  })
}

export async function deleteSticker(
  params: DeleteStickerParams
): Promise<void> {
  const query = new URLSearchParams({
    user_id: params.user_id,
    sticker_url: params.sticker_url
  })
  return request<void>(`${ENDPOINTS.sticker}?${query.toString()}`, {
    method: 'DELETE'
  })
}

export async function createEmblem(
  params: CreateEmblemParams
): Promise<Res<string>> {
  const data = new FormData()
  data.append('file', params.img)

  return request<Res<string>>(`${ENDPOINTS.emblem}/${params._id}`, {
    method: 'POST',
    body: data
  })
}

export async function deleteEmblem(params: DeleteEmblemParams): Promise<void> {
  const query = new URLSearchParams({
    user_id: params.user_id,
    emblem_url: params.emblem_url
  })
  return request<void>(`${ENDPOINTS.emblem}?${query.toString()}`, {
    method: 'DELETE'
  })
}

export async function getUser(params: GetUserParams): Promise<Res<GetUserRes>> {
  const query = new URLSearchParams({ auth_id: params.auth_id })
  if (params._id) query.append('_id', params._id)

  return request<Res<GetUserRes>>(`${ENDPOINTS.user}?${query.toString()}`, {
    method: 'GET'
  })
}

export async function subscribe(
  params: RegisterNotificationParams
): Promise<Res<void>> {
  return request<Res<void>>(`${ENDPOINTS.user}/subscribe`, {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

export async function unsubscribe(
  params: UnRegisterNotificationParams
): Promise<Res<void>> {
  return request<Res<void>>(`${ENDPOINTS.user}/unsubscribe`, {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

export async function changeUserName(
  params: ChangeUserNameParams
): Promise<Res<void>> {
  return request<Res<void>>(ENDPOINTS.user, {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

export async function onLoginEvent(params: OnLoginEventParams): Promise<void> {
  return request<void>(`${ENDPOINTS.user}/login`, {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

export async function updateUser(params: UpdateUserParams): Promise<Res<void>> {
  return request<Res<void>>(`${ENDPOINTS.user}/update`, {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

export async function searchMate(
  params: SearchMateParams
): Promise<Res<Mate[]>> {
  const query = new URLSearchParams({
    mateName: params.mateName,
    user_id: params.user_id
  })
  return request<Res<Mate[]>>(
    `${ENDPOINTS.user}/search_mate?${query.toString()}`,
    {
      method: 'GET'
    }
  )
}

export async function deleteProfileImg(
  params: DeleteProfileImgParams
): Promise<void> {
  return request<void>(
    `${ENDPOINTS.user}/img/${params._id}?stockImage=${params.stock_img}`,
    {
      method: 'DELETE'
    }
  )
}

export async function fetchPublicLobbies(): Promise<PublicLobby[]> {
  return request<PublicLobby[]>(`${ENDPOINTS.user}/lobbies`, {
    method: 'GET'
  })
}

export interface RecordEngagementActionResponse {
  should_prompt: boolean;
}

export async function recordEngagementAction(): Promise<RecordEngagementActionResponse> {
  return request<RecordEngagementActionResponse>(
    `${ENDPOINTS.user}/engagement/action`,
    {
      method: 'POST'
    }
  )
}

export async function setFeedbackOptOut(opted_out: boolean): Promise<void> {
  return request<void>(`${ENDPOINTS.user}/engagement/opt-out`, {
    method: 'PUT',
    body: JSON.stringify({ opted_out })
  })
}
