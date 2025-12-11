import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Mate } from '@/types/server.types'
import { useAPI } from '@/service/api/api.service'
import { useAuthStore } from '@/store/auth.store'

export const useFriendStore = defineStore('friend', () => {
  const friendRequestUsers = ref<Mate[]>([])
  const friendRequestLoading = ref(false)

  const api = useAPI()

  async function retrieveFriendRequestUsers() {
    const { user } = useAuthStore()
    if (!user || user.mate_requests_received.length === 0) return
    friendRequestLoading.value = true
    try {
      const users = await api.getPartialUsers({ _ids: user.mate_requests_received })
      if (users) {
        // merge unique users
        const newUsers = users.filter(u => !friendRequestUsers.value.find(x => x._id === u._id))
        friendRequestUsers.value.push(...newUsers)
      }
    } catch (e) {
      console.error(e)
    } finally {
      friendRequestLoading.value = false
    }
  }

  function findUserInFriendRequestUsers(user_id: string): Mate | undefined {
    return friendRequestUsers.value.find(u => u._id === user_id)
  }

  return {
    friendRequestUsers,
    friendRequestLoading,
    retrieveFriendRequestUsers,
    findUserInFriendRequestUsers
  }
})
