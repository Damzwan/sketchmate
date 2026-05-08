// --- friend.store.ts ---
import { defineStore } from 'pinia'
import { Mate, PopulatedConversation, User } from '@/types/server.types'
import { computed, ref } from 'vue'
import { useAPI } from '@/service/api/api.service'
import { getPendingRequests } from '@/service/api/chat.api'
import { fetchOnlineFriends } from '@/service/api/user.api'

export const useFriendStore = defineStore('friend', () => {
  const friends = ref<Mate[]>([])
  const onlineFriendIds = ref<Set<string>>(new Set())
  const pendingRequests = ref<PopulatedConversation[]>([])
  const friendRequestLoading = ref(false)

  const onlineFriends = computed(() => friends.value.filter(f => isFriendOnline.value(f._id)))

  const isFriendOnline = computed(() => (userId: string) => {
    return onlineFriendIds.value.has(userId)
  })

  // 1. Unified entry point for AuthStore
  async function initializeSocialGraph(user: User) {
    await Promise.all([
      fetchFriends(user), // Hydrate the names/images
      fetchPendingRequests(),
      fetchInitialOnlineFriends()
    ])
  }

  // 2. Hydrate the Mate objects (Names/Images)
  async function fetchFriends(user: User) {
    // Check both friends (new) and mates (legacy fallback)
    const idsToFetch = user.friends?.length ? user.friends : (user.mates as any[] || [])

    if (idsToFetch.length > 0) {
      try {
        const api = useAPI()
        // Map to strings just in case they are objects
        const cleanIds = idsToFetch.map(id => typeof id === 'string' ? id : id._id)
        const fullMates = await api.getPartialUsers({ _ids: cleanIds })
        if (!fullMates) return
        friends.value = fullMates
      } catch (e) {
        console.error('Failed to hydrate friends list', e)
      }
    }
  }

  async function fetchPendingRequests() {
    friendRequestLoading.value = true
    try {
      const requests = await getPendingRequests()
      pendingRequests.value = requests
    } catch (e) {
      console.error('Failed to fetch pending requests:', e)
    } finally {
      friendRequestLoading.value = false
    }
  }

  async function fetchInitialOnlineFriends() {
    try {
      const onlineIds = await fetchOnlineFriends()
      onlineFriendIds.value = new Set(onlineIds)
    } catch (e) {
      console.error('Failed to fetch initial online friends', e)
    }
  }

  function setFriendOnlineStatus(userId: string, isOnline: boolean) {
    if (isOnline) {
      onlineFriendIds.value.add(userId)
    } else {
      onlineFriendIds.value.delete(userId)
    }
  }

  return {
    friends,
    onlineFriendIds,
    pendingRequests,
    friendRequestLoading,
    isFriendOnline,
    onlineFriends,
    initializeSocialGraph,
    setFriendOnlineStatus,
    fetchPendingRequests // Exposed so UI can refresh it manually
  }
})