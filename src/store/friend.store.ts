import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ChatStatus, FeedPost, NetworkUser, PopulatedConversation, User } from '@/types/server.types'
import { getPendingRequests } from '@/service/api/chat.api'
import { fetchOnlineFriends, fetchUserProfile } from '@/service/api/user.api'
import { fetchNetworkType, getBlockedIds, toggleFollow } from '@/service/api/relationship.api'
import { useChatStore } from '@/store/chat.store'
import { useAuthStore } from '@/store/auth.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'

export const useFriendStore = defineStore('friend', () => {
  const authStore = useAuthStore()

  // --- STATE ---
  const onlineFriendIds = ref<Set<string>>(new Set())
  const onlineCache = ref<Map<string, NetworkUser>>(new Map())
  const pendingRequests = ref<PopulatedConversation[]>([])
  const friendRequestLoading = ref(false)
  const blockedUserIds = ref<Set<string>>(new Set())

  // myStats now mirrors the authStore user stats for convenience
  const myStats = computed(() => authStore.user?.stats || {
    mates: 0,
    followers: 0,
    following: 0,
    posts: 0
  })

  const networkLists = ref<{
    mates: NetworkUser[];
    following: NetworkUser[];
    followers: NetworkUser[];
  }>({
    mates: [],
    following: [],
    followers: []
  })

  const networkLoading = ref(false)
  const hasMore = ref(true)
  const targetProfile = ref<NetworkUser | null>(null)
  const targetPosts = ref<FeedPost[]>([])
  const loadingProfile = ref(false)

  // --- GETTERS ---

  const isFriendOnline = computed(() => (userId: string) => {
    return onlineFriendIds.value.has(userId)
  })

  const onlineFriends = computed(() => {
    return Array.from(onlineFriendIds.value)
      .map(id => resolvePartnerInfo(id))
      .filter(Boolean) as NetworkUser[]
  })

  const allConnectedPartners = computed(() => {
    const chatStore = useChatStore()
    const me = authStore.user?._id
    if (!me) return []

    const uniqueMap = new Map<string, NetworkUser>()
    networkLists.value.mates.forEach(m => uniqueMap.set(m._id, m))

    chatStore.activeChats.forEach(chat => {
      const partner = chat.participants.find(p => p._id !== me)
      if (partner) uniqueMap.set(partner._id, partner as any)
    })

    return Array.from(uniqueMap.values())
  })

  const isBlocked = computed(() => (userId: string) => {
    return blockedUserIds.value.has(userId.toString())
  })

  // --- METHODS ---

  const resolvePartnerInfo = (id: string): NetworkUser | null => {
    const drawSyncer = useDrawSyncer()
    const chatStore = useChatStore()

    let baseProfile: any =
      onlineCache.value.get(id) ||
      networkLists.value.mates.find(m => m._id === id) ||
      drawSyncer.roomMembers.find(m => m._id === id) ||
      (targetProfile.value?._id === id ? targetProfile.value : null)


    const allConvos = [...chatStore.activeChats, ...pendingRequests.value]
    const chat = allConvos.find(c => c.participants.some(p => p._id === id))

    if (!baseProfile && chat) {
      baseProfile = chat.participants.find(p => p._id !== authStore.user?._id)
    }

    if (!baseProfile) return null

    const normalizedProfile = {
      ...baseProfile,
      last_seen_version: baseProfile.last_seen_version || baseProfile.version
    }

    if (isBlocked.value(id)) {
      return { ...normalizedProfile, chat_status: 'blocked' } as NetworkUser
    }

    if (chat) {
      return { ...normalizedProfile, chat_status: chat.status as ChatStatus } as NetworkUser
    }

    return { ...normalizedProfile } as NetworkUser
  }

  async function initializeSocialGraph() {
    // syncMyStats removed: data is already inside authStore.user.stats
    await Promise.all([
      fetchPendingRequests(),
      fetchInitialOnlineFriends(),
      fetchBlockedUsers()
    ])
  }

  async function fetchInitialOnlineFriends() {
    try {
      const onlineUsers: NetworkUser[] = await fetchOnlineFriends() as any
      onlineUsers.forEach(u => {
        onlineFriendIds.value.add(u._id)
        onlineCache.value.set(u._id, u)
      })
    } catch (e) {
      console.error('Failed to fetch initial online friends', e)
    }
  }

  async function setFriendOnlineStatus(userId: string, isOnline: boolean) {
    if (isOnline) {
      onlineFriendIds.value.add(userId)
      if (!resolvePartnerInfo(userId)) {
        try {
          const res = await fetchUserProfile(userId)
          if (res.profile) onlineCache.value.set(userId, res.profile)
        } catch (e) {
        }
      }
    } else {
      onlineFriendIds.value.delete(userId)
    }
  }

  async function fetchPendingRequests() {
    friendRequestLoading.value = true
    try {
      pendingRequests.value = await getPendingRequests()
    } catch (e) {
      console.error('Failed to fetch pending requests:', e)
    } finally {
      friendRequestLoading.value = false
    }
  }

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

  async function getNetworkList(type: 'mates' | 'following' | 'followers', userId: string, page = 1, search = '') {
    if (page === 1) networkLoading.value = true
    try {
      const res = await fetchNetworkType(userId, type, { page, search, limit: 20 })
      if (page === 1) {
        networkLists.value[type] = res
      } else {
        networkLists.value[type].push(...res)
      }
      hasMore.value = res.length === 20
    } catch (e) {
      console.error(`Failed to fetch ${type}`, e)
      hasMore.value = false
    } finally {
      networkLoading.value = false
    }
  }

  async function fetchBlockedUsers() {
    try {
      const blockedIds: string[] = await getBlockedIds()
      blockedUserIds.value = new Set(blockedIds)
    } catch (e) {
      console.error('Failed to fetch blocked user IDs', e)
    }
  }

  // --- LOCAL MUTATIONS ---

  function blockUserLocally(userId: string) {
    blockedUserIds.value.add(userId)
    onlineFriendIds.value.delete(userId)
  }

  function unblockUserLocally(userId: string) {
    blockedUserIds.value.delete(userId)
  }

  function removeFriendLocally(userId: string) {
    networkLists.value.mates = networkLists.value.mates.filter(m => m._id !== userId)
    onlineFriendIds.value.delete(userId)
    onlineCache.value.delete(userId)
    if (targetProfile.value?._id === userId) targetProfile.value = null

    // Decrement local stats
    if (authStore.user?.stats && authStore.user.stats.mates) authStore.user.stats.mates--
  }

  function addFriendLocally(mate: NetworkUser) {
    const exists = networkLists.value.mates.some(m => m._id === mate._id)
    if (!exists) {
      networkLists.value.mates.unshift({ ...mate, chat_status: 'mate' })
      // Increment local stats
      if (authStore.user?.stats && authStore.user.stats.mates) authStore.user.stats.mates++
    }
    if (onlineFriendIds.value.has(mate._id)) {
      onlineCache.value.set(mate._id, { ...mate, chat_status: 'mate' })
    }
  }

  async function toggleFollowUser(target: NetworkUser) {
    if (!authStore.user?._id || target._id === authStore.user._id) return

    const wasFollowing = networkLists.value.following.some(f => f._id === target._id)
    const originalTargetStats = target.stats ? { ...target.stats } : null

    // 1. Optimistic Update (Target)
    if (wasFollowing) {
      networkLists.value.following = networkLists.value.following.filter(f => f._id !== target._id)
      if (target.stats) target.stats.followers--
      if (authStore.user.stats) authStore.user.stats.following--
    } else {
      networkLists.value.following.push(target)
      if (target.stats) target.stats.followers++
      if (authStore.user.stats) authStore.user.stats.following++
    }

    try {
      const res = await toggleFollow(target._id)
      return res.isFollowing
    } catch (e) {
      // Rollback
      if (wasFollowing) {
        networkLists.value.following.push(target)
        if (authStore.user.stats) authStore.user.stats.following++
      } else {
        networkLists.value.following = networkLists.value.following.filter(f => f._id !== target._id)
        if (authStore.user.stats) authStore.user.stats.following--
      }
      if (target.stats && originalTargetStats) {
        target.stats.followers = originalTargetStats.followers
      }
      throw e
    }
  }

  return {
    onlineFriendIds,
    onlineCache,
    pendingRequests,
    friendRequestLoading,
    targetProfile,
    targetPosts,
    loadingProfile,
    networkLists,
    networkLoading,
    hasMore,
    myStats,
    isFriendOnline,
    onlineFriends,
    allConnectedPartners,
    isBlocked,
    initializeSocialGraph,
    setFriendOnlineStatus,
    fetchPendingRequests,
    getProfile,
    resolvePartnerInfo,
    getNetworkList,
    blockUserLocally,
    unblockUserLocally,
    removeFriendLocally,
    toggleFollowUser,
    addFriendLocally
  }
})