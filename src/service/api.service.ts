import {API, CreateUserRes, ENDPOINTS, GetUserParams, Res, SubscribeParams, User} from '@/types/server.types';
import {Storage} from '@/types/app.types';

enum REQUEST_TYPES {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export function useAPI(): API {
  const baseUrl = import.meta.env.VITE_BACKEND_LOCAL as string;

  async function getUser(params: GetUserParams): Promise<Res<User>> {
    try {
      const url = `${baseUrl}${ENDPOINTS.get_user}?${new URLSearchParams({_id: params._id})}`
      return await fetch(url, {method: REQUEST_TYPES.GET,}).then(res => res.json());
    } catch (e) {
      const user = await createUser();
      if (!user) throw new Error();
      else {
        localStorage.setItem(Storage.user, user._id);
        return await getUser({_id: user._id});
      }
    }
  }

  async function createUser(): Promise<Res<CreateUserRes>> {
    const url = `${baseUrl}${ENDPOINTS.create_user}`
    return await fetch(url, {method: REQUEST_TYPES.POST}).then(res => res.json());
  }

  async function getDrawings(params: GetUserParams) {
    const url = `${baseUrl}${ENDPOINTS.get_user}?${new URLSearchParams({_id: params._id})}`
    return await fetch(url, {method: REQUEST_TYPES.GET,}).then(res => res.json());
  }

  async function subscribe(params: SubscribeParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.subscribe}`
    await fetch(url, {method: REQUEST_TYPES.PUT, body: JSON.stringify(params)})
  }

  // TODO should be delete...
  // TODO make use of url params
  async function unsubscribe(params: GetUserParams): Promise<Res<void>> {
    const url = `${baseUrl}${ENDPOINTS.unsubscribe}`
    await fetch(url, {method: REQUEST_TYPES.PUT, body: JSON.stringify(params)})
  }

  return {
    createUser,
    getUser,
    getDrawings,
    subscribe,
    unsubscribe
  }
}
