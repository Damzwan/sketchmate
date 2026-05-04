import { storeToRefs } from 'pinia'
import { usePhotoSwiper } from '@/store/photoswiper.store'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { useAuthStore } from '@/store/auth.store'
import { useInboxStore } from '@/store/inbox.store'
import { isInRoom } from '@/draw/helpers/drawSyncing.helper'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'

export function useInboxSwiper() {
  const swiperStore = usePhotoSwiper()
  const api = useAPI()
  const { toast } = useToast()
  const { user } = storeToRefs(useAuthStore())
  const { removeFromLocalInbox, findUserInInboxUsers } = useInboxStore()

  function seeItem(item: any) {
    if (!item._id || !user.value) return
    const userId = user.value._id
    if (!item.seen_by?.includes(userId) || !item.comments_seen_by?.includes(userId)) {
      api.seeInboxItem({ user_id: userId, inbox_id: item._id })
      item.seen_by?.push(userId)
      item.comments_seen_by?.push(userId)
    }
  }

  function openInboxSwiper(inboxItems: any[], index: number) {
    swiperStore.openSwiper(inboxItems, index, {
      onSeen: seeItem,

      onDelete: async (item) => {
        removeFromLocalInbox(item._id)
        toast('Item deleted')
        try {
          await api.removeFromInbox({ user_id: user.value!._id, inbox_id: item._id })
        } catch (e) {
          toast('Failed to delete item from server', { color: 'danger' })
        }
      },

      canReply: true,

      onReply: (item) => {
        if (isInRoom()) {
          toast('Not allowed when in a lobby', { color: 'warning' })
          return
        }
        router.push({
          path: FRONTEND_ROUTES.draw,
          query: {
            canvas_url: item.drawing,
            mode: 'solo'
          }
        })
      },

      userLookup: (userId: string) => findUserInInboxUsers(userId),

      canDelete: (item, currentUser) => {
        return true
      }
    })
  }

  // 3. Export both so Gallery.vue can use seeItem on hover!
  return { openInboxSwiper, seeItem }
}