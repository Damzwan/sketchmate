// Utilities
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useAPI } from '@/service/api/api.service'
import { useAuthStore } from '@/store/auth.store'
import { useInboxStore } from '@/store/inbox.store'


export const usePhotoSwiper = defineStore('photoswiper', () => {
  const open = ref(false)
  const slide = ref(0)
  const { inbox } = storeToRefs(useInboxStore())
  const api = useAPI()

  function seeItem(index?: number) {
    const indexOfItemToSee = index != undefined ? index : slide.value

    const { user } = useAuthStore()
    const item = inbox.value[indexOfItemToSee]


    if (!item) return

    if (item.seen_by.includes(user!._id) && item.comments_seen_by.includes(user!._id)) return

    api.seeInboxItem({
      user_id: user!._id,
      inbox_id: item._id
    })
    inbox.value![indexOfItemToSee].seen_by.push(user!._id)
    inbox.value[indexOfItemToSee].comments_seen_by.push(user!._id)
  }

  return {
    open,
    slide,
    seeItem
  }
})
