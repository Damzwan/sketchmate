import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface SwiperConfig {
  onSeen?: (item: any) => void
  onDelete?: (item: any) => void
  onReply?: (item: any) => void
  userLookup?: (userId: string) => any // Function to resolve user details (name, avatar)
  canDelete?: (item: any, user: any) => boolean // Custom delete logic
  canReply?: boolean // Toggle reply button
}

export const usePhotoSwiper = defineStore('photoswiper', () => {
  const open = ref(false)
  const slide = ref(0)
  const collection = ref<any[]>([])
  const config = ref<SwiperConfig>({})

  const currentItem = computed(() => collection.value[slide.value])

  /**
   * @param items - The array of items to swipe through
   * @param startIndex - Which index to start on
   * @param swiperConfig - Configuration and callbacks for decoupling
   */
  function openSwiper(items: any[], startIndex = 0, swiperConfig: SwiperConfig = {}) {
    collection.value = items
    slide.value = startIndex
    config.value = swiperConfig
    open.value = true
  }

  function seeItem() {
    if (!currentItem.value) return

    if (config.value.onSeen) {
      config.value.onSeen(currentItem.value)
    }
  }

  return {
    open,
    slide,
    collection,
    currentItem,
    config,
    openSwiper,
    seeItem
  }
})