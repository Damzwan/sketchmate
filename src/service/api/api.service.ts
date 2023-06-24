import {
  API,
  ChangeUserNameParams,
  CreateEmblemParams,
  CreateSavedParams,
  CreateStickerParams,
  DeleteEmblemParams,
  DeleteSavedParams,
  DeleteStickerParams,
  ENDPOINTS,
  GetInboxItemsParams,
  GetUserParams,
  InboxItem,
  RemoveFromInboxParams,
  Res,
  Saved,
  SubscribeParams,
  UploadProfileImgParams,
  User
} from '@/types/server.types'
import { LocalStorage } from '@/types/storage.types'
import { createGlobalState } from '@vueuse/core'

enum REQUEST_TYPES {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE'
}

export const useAPI = createGlobalState((): API => {
  const baseUrl = import.meta.env.VITE_BACKEND as string

  async function getUser(params: GetUserParams): Promise<Res<User>> {
    try {
      const url = `${baseUrl}${ENDPOINTS.user}?${new URLSearchParams({
        _id: params._id
      })}`
      return await fetch(url, { method: REQUEST_TYPES.GET }).then(res => res.json())
    } catch (e) {
      return await createUser()
    }
  }

  async function createUser(): Promise<Res<User>> {
    const url = `${baseUrl}${ENDPOINTS.user}`
    try {
      const user: Res<User> = await fetch(url, {
        method: REQUEST_TYPES.POST
      }).then(res => res.json())
      if (!user) throw new Error()
      localStorage.setItem(LocalStorage.user, user._id)
      return user
    } catch (e) {
      console.log(e)
    }
  }

  async function subscribe(params: SubscribeParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.subscribe}`
    await fetch(url, {
      method: REQUEST_TYPES.PUT,
      body: JSON.stringify(params)
    })
  }

  async function unsubscribe(params: GetUserParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.unsubscribe}`
    await fetch(url, {
      method: REQUEST_TYPES.PUT,
      body: JSON.stringify(params)
    })
  }

  async function getInbox(params: GetInboxItemsParams): Promise<Res<InboxItem[]>> {
    const url = `${baseUrl}${ENDPOINTS.inbox}?${new URLSearchParams({
      _ids: params._ids.join()
    })}`
    return await fetch(url, { method: REQUEST_TYPES.GET }).then(res => res.json())
  }

  async function removeFromInbox(params: RemoveFromInboxParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.inbox}/${params.user_id}/${params.inbox_id}`
    await fetch(url, { method: REQUEST_TYPES.DELETE })
  }

  async function changeUserName(params: ChangeUserNameParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.user}`
    await fetch(url, {
      method: REQUEST_TYPES.PUT,
      body: JSON.stringify(params)
    })
  }

  async function uploadProfileImg(params: UploadProfileImgParams): Promise<Res<string>> {
    const url = `${baseUrl}${ENDPOINTS.user}/img/${params._id}?${params.mate_id ? `mate_id=${params.mate_id}` : ''}${
      params.previousImage ? `&previousImage=${params.previousImage}` : ''
    }`
    const data = new FormData()
    data.append('file', params.img)
    return await fetch(url, {
      method: REQUEST_TYPES.PUT,
      body: data
    }).then(async res => await res.text())
  }

  async function createSticker(params: CreateStickerParams): Promise<Res<string>> {
    const url = `${baseUrl}${ENDPOINTS.sticker}/${params._id}`
    const data = new FormData()
    data.append('file', params.img)
    return await fetch(url, {
      method: REQUEST_TYPES.POST,
      body: data
    }).then(async res => await res.text())
  }

  async function createEmblem(params: CreateEmblemParams): Promise<Res<string>> {
    const url = `${baseUrl}${ENDPOINTS.emblem}/${params._id}`
    const data = new FormData()
    data.append('file', params.img)
    return await fetch(url, {
      method: REQUEST_TYPES.POST,
      body: data
    }).then(async res => await res.text())
  }

  async function deleteSticker(params: DeleteStickerParams): Promise<void> {
    const queryParams = new URLSearchParams({
      user_id: params.user_id,
      sticker_url: params.sticker_url
    })
    const url = `${baseUrl}${ENDPOINTS.sticker}?${queryParams}`

    await fetch(url, { method: REQUEST_TYPES.DELETE })
  }

  async function deleteEmblem(params: DeleteEmblemParams): Promise<void> {
    const queryParams = new URLSearchParams({
      user_id: params.user_id,
      emblem_url: params.emblem_url
    })
    const url = `${baseUrl}${ENDPOINTS.emblem}?${queryParams}`

    await fetch(url, { method: REQUEST_TYPES.DELETE })
  }

  async function createSaved(params: CreateSavedParams): Promise<Res<Saved>> {
    const url = `${baseUrl}${ENDPOINTS.saved}/${params._id}`

    const jsonBlob = new Blob([params.drawing], { type: 'application/json' })
    const jsonFile = new File([jsonBlob], 'drawing.json', { type: 'application/json' })

    const imgFile = new File([params.img], 'img.webp', { type: 'image/webp' })

    const data = new FormData()
    data.append('img', imgFile)
    data.append('drawing', jsonFile)

    return await fetch(url, {
      method: REQUEST_TYPES.POST,
      body: data
    }).then(async res => res.json())
  }

  async function deleteSaved(params: DeleteSavedParams): Promise<void> {
    const queryParams = new URLSearchParams({
      user_id: params.user_id,
      drawing_url: params.drawing_url,
      img_url: params.img_url
    })
    const url = `${baseUrl}${ENDPOINTS.saved}?${queryParams}`

    await fetch(url, { method: REQUEST_TYPES.DELETE })
  }

  return {
    createUser,
    getUser,
    subscribe,
    unsubscribe,
    getInbox,
    removeFromInbox,
    changeUserName,
    uploadProfileImg,
    createSticker,
    createEmblem,
    deleteSticker,
    deleteEmblem,
    createSaved,
    deleteSaved
  }
})
