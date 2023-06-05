import { Storage } from '@/types/storage.types'
import { User } from '@/types/server.types'
import { useAPI } from '@/service/api/api.service'

const api = useAPI()

export async function getUser(): Promise<User> {
  const user_id = localStorage.getItem(Storage.user)
  const user = !user_id ? await api.createUser() : await api.getUser({ _id: user_id })
  if (!user) throw new Error()
  return user
}
