import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Mate, FeedPost, User, PopulatedConversation } from '@/types/server.types'
import { useAPI } from '@/service/api/api.service'
import { getPendingRequests } from '@/service/api/chat.api'
import { fetchOnlineFriends, fetchUserProfile } from '@/service/api/user.api'
import { useChatStore } from '@/store/chat.store'
import { useAuthStore } from '@/store/auth.store'

export const useFriendStore = defineStore('friend', () => {
  // --- STATE ---
  const friends = ref<Mate[]>([])
  const onlineFriendIds = ref<Set<string>>(new Set())
  const pendingRequests = ref<PopulatedConversation[]>([])
  const friendRequestLoading = ref(false)

  // Profile Viewing State
  const targetProfile = ref<any>(null)
  const targetPosts = ref<FeedPost[]>([])
  const loadingProfile = ref(false)

  // --- GETTERS (Computed) ---
  const onlineFriends = computed(() => {
    const chatStore = useChatStore()
    const authStore = useAuthStore()
    const me = authStore.user?._id

    if (!me) return []

    const activePartners = chatStore.activeChats
      .filter(chat => chat.status !== 'expired') // <--- The critical filter
      .map(chat => {
        return chat.participants.find(p => p._id !== me)
      })
      .filter((p): p is Mate => !!p)

    const uniquePartnersMap = new Map<string, Mate>()

    friends.value.forEach(f => uniquePartnersMap.set(f._id, f))

    activePartners.forEach(p => uniquePartnersMap.set(p._id, p))

    return Array.from(uniquePartnersMap.values()).filter(partner =>
      onlineFriendIds.value.has(partner._id)
    )
  })

  const isFriendOnline = computed(() => (userId: string) => {
    const isConnected = onlineFriendIds.value.has(userId)
    if (!isConnected) return false
    const chatStore = useChatStore()
    const chat = chatStore.activeChats.find(c =>
      c.participants.some(p => p._id === userId)
    )
    if (!chat || chat.status === 'expired') {
      const isMate = friends.value.some(f => f._id === userId)
      return isMate
    }

    return true
  })

  const allConnectedPartners = computed(() => {
    const chatStore = useChatStore()
    const authStore = useAuthStore()
    const me = authStore.user?._id

    if (!me) return []

    const uniquePartnersMap = new Map<string, Mate>()

    // 1. Add established Mates
    friends.value.forEach(f => uniquePartnersMap.set(f._id, f))

    // 2. Add partners from active chats ONLY if not expired
    chatStore.activeChats.forEach(chat => {
      // We only allow inviting people in 'active', 'temporary', or 'mate_pending' states
      const isInvitable = ['active', 'temporary', 'mate_pending'].includes(chat.status)

      if (isInvitable) {
        const partner = chat.participants.find(p => p._id !== me)
        if (partner) uniquePartnersMap.set(partner._id, partner as Mate)
      }
    })

    return Array.from(uniquePartnersMap.values())
  })

  // --- ACTIONS ---

  /**
   * Main entry point to setup the social graph on login/app start
   */
  async function initializeSocialGraph(user: User) {
    await Promise.all([
      fetchFriends(user),
      fetchPendingRequests(),
      fetchInitialOnlineFriends()
    ])
  }

  /**
   * Hydrates the friends list from the IDs stored in the User document
   */
  async function fetchFriends(user: User) {
    // Check both friends array and legacy mates array
    const idsToFetch = user.friends?.length ? user.friends : (user.mates as any[] || [])

    if (idsToFetch.length > 0) {
      try {
        const api = useAPI()
        const cleanIds = idsToFetch.map(id => typeof id === 'string' ? id : id._id)
        const fullMates = await api.getPartialUsers({ _ids: cleanIds })
        if (fullMates) friends.value = fullMates
      } catch (e) {
        console.error('Failed to hydrate friends list', e)
      }
    }
  }

  /**
   * Fetches incoming chat requests ('pending' status)
   */
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

  /**
   * One-time check of who is currently online via Socket.io
   */
  async function fetchInitialOnlineFriends() {
    try {
      const onlineIds = await fetchOnlineFriends()
      onlineFriendIds.value = new Set(onlineIds)
    } catch (e) {
      console.error('Failed to fetch initial online friends', e)
    }
  }

  /**
   * Handles real-time 'friend:online' and 'friend:offline' events
   */
  function setFriendOnlineStatus(userId: string, isOnline: boolean) {
    if (isOnline) onlineFriendIds.value.add(userId)
    else onlineFriendIds.value.delete(userId)
  }

  /**
   * Locally adds a friend to the list (Used when a Mate proposal is accepted)
   */
  function addFriendLocally(partner: Mate) {
    const exists = friends.value.some(f => f._id === partner._id)
    if (!exists) {
      friends.value.push(partner)
    }
  }

  /**
   * Fetches data for the profile inspector
   */
  async function getProfile(userId: string) {
    loadingProfile.value = true
    try {
      const res = await fetchUserProfile(userId)
      targetProfile.value = res.profile
      targetPosts.value = res.posts as any
    } catch (e) {
      console.error('Error fetching target profile:', e)
    } finally {
      loadingProfile.value = false
    }
  }

  /**
   * Helper to find a user's name/img/id across all active contexts
   */
  const resolvePartnerInfo = (id: string) => {
    const chatStore = useChatStore()
    const authStore = useAuthStore()
    const me = authStore.user?._id

    // 1. Search in Active Chats & Pending Requests
    const allConversations = [...chatStore.activeChats, ...pendingRequests.value]
    const chat = allConversations.find(c =>
      c._id === id || c.participants.some(p => p._id === id)
    )

    if (chat) {
      const partner = chat.participants.find(p => p._id !== me)
      if (partner) return partner
    }

    // 2. Search in established Friends (Mates)
    const friend = friends.value.find(f => f._id === id)
    if (friend) return friend

    // 3. Fallback to current profile view
    if (targetProfile.value?._id === id) return targetProfile.value

    return null
  }

  function removeFriendLocally(userId: string) {
    friends.value = friends.value.filter(f => f._id !== userId)
    onlineFriendIds.value.delete(userId)
  }

  return {
    // State
    friends,
    onlineFriendIds,
    pendingRequests,
    friendRequestLoading,
    targetProfile,
    targetPosts,
    loadingProfile,

    // Getters
    isFriendOnline,
    onlineFriends,

    // Actions
    initializeSocialGraph,
    setFriendOnlineStatus,
    fetchPendingRequests,
    addFriendLocally,
    getProfile,
    resolvePartnerInfo,
    removeFriendLocally,
    allConnectedPartners
  }
})