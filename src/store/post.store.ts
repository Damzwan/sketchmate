import { defineStore } from 'pinia'
import { ref } from 'vue'
import { FeedPost } from '@/types/server.types'
import { fetchUserPosts } from '@/service/api/user.api'
import { fetchFeed, toggleReaction as apiReact } from '@/service/api/post.api'

export const usePostStore = defineStore('post', () => {
  const feedPosts = ref<FeedPost[]>([])
  const userPosts = ref<FeedPost[]>([])
  const userPage = ref(1)
  const hasMoreUserPosts = ref(true)
  const isProfileDirty = ref(false)
  const isFeedDirty = ref(false)
  const limit = 20


  async function getFeed(isRefresh = false) {
    try {
      const res = await fetchFeed(limit)
      feedPosts.value = res.feed
      isFeedDirty.value = false
    } catch (error) {
      console.error('Failed to fetch feed', error)
      throw error
    }
  }

  async function getUserPosts(userId: string, isInitial = false) {
    if (isInitial) {
      userPage.value = 1
      hasMoreUserPosts.value = true
    }
    try {
      const res = await fetchUserPosts(userId, userPage.value, limit)
      const fetchedPosts = res.posts || []
      if (isInitial) userPosts.value = fetchedPosts
      else userPosts.value.push(...fetchedPosts)

      hasMoreUserPosts.value = fetchedPosts.length === limit
      userPage.value++
      isProfileDirty.value = false
    } catch (error) {
      console.error('Failed to fetch gallery', error)
      throw error
    }
  }

  // --- ACTIONS: MUTATIONS ---

  function removePostLocally(postId: string) {
    feedPosts.value = feedPosts.value.filter(p => p._id !== postId)
    userPosts.value = userPosts.value.filter(p => p._id !== postId)
  }

  /**
   * Universal Reaction Toggle: Updates the post object wherever it exists in the store
   */
  async function toggleReactionLocally(postId: string, type: string) {
    // Find post in either array
    const findAndToggle = (list: FeedPost[]) => {
      const post = list.find(p => p._id === postId)
      if (!post) return

      const isRemoving = post.user_reaction === type
      const previousReaction = post.user_reaction

      if (isRemoving) {
        post.user_reaction = null
        post.reaction_counts[type]--
      } else {
        if (previousReaction) post.reaction_counts[previousReaction]--
        post.user_reaction = type
        post.reaction_counts[type] = (post.reaction_counts[type] || 0) + 1
      }
    }

    findAndToggle(feedPosts.value)
    findAndToggle(userPosts.value)

    return await apiReact(postId, type)
  }

  function markProfileDirty() {
    isProfileDirty.value = true
  }

  function markFeedDirty() {
    isFeedDirty.value = true
  }

  return {
    feedPosts,
    userPosts,
    userPage,
    hasMoreUserPosts,
    isProfileDirty,
    isFeedDirty,
    getUserPosts,
    getFeed,
    removePostLocally,
    toggleReactionLocally,
    markProfileDirty,
    markFeedDirty
  }
})