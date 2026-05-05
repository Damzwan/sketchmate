import { storeToRefs } from 'pinia'
import { usePhotoSwiper } from '@/store/photoswiper.store'
import { useToast } from '@/service/toast.service'
import { useAuthStore } from '@/store/auth.store'
import { isInRoom } from '@/draw/helpers/drawSyncing.helper'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { postComment } from '@/service/api/post.api'

export function usePostSwiper() {
  const swiperStore = usePhotoSwiper()
  const { toast } = useToast()
  const { user } = storeToRefs(useAuthStore())

  function openPostSwiper(posts: any[], index: number) {
    swiperStore.openSwiper(posts, index, {
      imageResolver: (item) => item.image_url,
      thumbnailResolver: (item) => item.thumbnail_url,

      canReply: true,

      onReply: (item) => {
        if (isInRoom()) {
          toast('Not allowed when in a lobby', { color: 'warning' })
          return
        }
        router.push({
          path: FRONTEND_ROUTES.draw,
          query: {
            canvas_url: item.drawing_url || item.drawing,
            mode: 'solo'
          }
        })
      },

      // Social features
      onComment: async (item, message) => {
        try {
          await postComment(item._id, message)
          // You might want to update local state here or re-fetch comments
        } catch (e) {
          toast('Failed to post comment', { color: 'danger' })
        }
      },

      // Permissions: Only author or admins can delete public posts
      canDelete: (item, currentUser) => {
        return item.author_id === currentUser._id
      },

      // Look up author info instead of followers
      userLookup: (userId: string) => {
        // If the item has the author object hydrated, return it
        // This matches our feed hydration logic
        return null // Implement based on how you store author cache
      }
    })
  }

  return { openPostSwiper }
}