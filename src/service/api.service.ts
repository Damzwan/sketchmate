import {
  API,
  ChangeUserNameParams,
  Comment,
  CommentParams,
  ENDPOINTS,
  GetInboxItemsParams,
  GetUserParams,
  InboxItem,
  RemoveFromInboxParams,
  Res,
  SubscribeParams,
  UploadProfileImgParams,
  User,
} from '@/types/server.types';
import { Storage } from '@/types/app.types';
import { createGlobalState } from '@vueuse/core';

enum REQUEST_TYPES {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export const useAPI = createGlobalState((): API => {
  const baseUrl = import.meta.env.VITE_BACKEND as string;

  async function getUser(params: GetUserParams): Promise<Res<User>> {
    try {
      const url = `${baseUrl}${ENDPOINTS.user}?${new URLSearchParams({ _id: params._id })}`;
      return await fetch(url, { method: REQUEST_TYPES.GET }).then((res) => res.json());
    } catch (e) {
      return await createUser();
    }
  }

  async function createUser(): Promise<Res<User>> {
    const url = `${baseUrl}${ENDPOINTS.user}`;
    const user: Res<User> = await fetch(url, { method: REQUEST_TYPES.POST }).then((res) => res.json());
    if (!user) throw new Error();
    localStorage.setItem(Storage.user, user._id);
    return user;
  }

  async function subscribe(params: SubscribeParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.subscribe}`;
    await fetch(url, { method: REQUEST_TYPES.PUT, body: JSON.stringify(params) });
  }

  async function unsubscribe(params: GetUserParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.unsubscribe}`;
    await fetch(url, { method: REQUEST_TYPES.PUT, body: JSON.stringify(params) });
  }

  async function getInbox(params: GetInboxItemsParams): Promise<Res<InboxItem[]>> {
    const url = `${baseUrl}${ENDPOINTS.inbox}?${new URLSearchParams({ _ids: params._ids.join() })}`;
    return await fetch(url, { method: REQUEST_TYPES.GET }).then((res) => res.json());
  }

  async function comment(params: CommentParams): Promise<Res<Comment>> {
    const url = `${baseUrl}${ENDPOINTS.inbox}`;
    return await fetch(url, { method: REQUEST_TYPES.PUT, body: JSON.stringify(params) }).then((res) => res.json());
  }

  async function removeFromInbox(params: RemoveFromInboxParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.inbox}/${params.user_id}/${params.inbox_id}`;
    await fetch(url, { method: REQUEST_TYPES.DELETE });
  }

  async function changeUserName(params: ChangeUserNameParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.user}`;
    await fetch(url, { method: REQUEST_TYPES.PUT, body: JSON.stringify(params) });
  }

  async function uploadProfileImg(params: UploadProfileImgParams): Promise<Res<string>> {
    const url = `${baseUrl}${ENDPOINTS.user}/img/${params._id}?${params.mate_id ? `mate_id=${params.mate_id}` : ''}${
      params.previousImage ? `&previousImage=${params.previousImage}` : ''
    }`;
    const data = new FormData();
    data.append('file', params.img);
    return await fetch(url, {
      method: REQUEST_TYPES.PUT,
      body: data,
    }).then(async (res) => await res.text());
  }

  return {
    createUser,
    getUser,
    subscribe,
    unsubscribe,
    getInbox,
    comment,
    removeFromInbox,
    changeUserName,
    uploadProfileImg,
  };
});
