import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import { useInboxStore } from '@/store/inbox.store'
import { useSessionStore } from '@/store/session.store'
import { useAuthStore } from '@/store/auth.store'
import { usePhotoSwiper } from '@/store/photoswiper.store'
import { EventBus } from '@/main'

export function useGalleryData() {
  const route = useRoute()
  const { isLoggedIn } = storeToRefs(useAuthStore())
  const { queryParams } = storeToRefs(useSessionStore())
  const { setQueryParams } = useSessionStore()
  const { open, slide } = storeToRefs(usePhotoSwiper())

  const inboxStore = useInboxStore()
  const { inbox, isInboxLoading, allLoaded, hasFetchedInitial } = storeToRefs(inboxStore)

  const isLoading = ref(true)

  const groupedInboxItems = computed(() => {
    const inboxPerMonth: { [key: string]: any[] } = {}
    inbox.value.forEach(item => {
      const key = dayjs(item.date).format('YYYY-MM')
      if (!(key in inboxPerMonth)) inboxPerMonth[key] = []
      inboxPerMonth[key].push(item)
    })
    return inboxPerMonth
  })

  const noMessages = computed(() => inbox.value.length === 0)

  async function fetchInitialInbox() {
    if (isLoggedIn.value && !hasFetchedInitial.value) {
      isLoading.value = true
      await inboxStore.getInboxBatch(true)
      isLoading.value = false
      checkQueryParams()
    } else {
      isLoading.value = false
    }
  }

  async function loadMore(ev: any) {
    await inboxStore.getInboxBatch()
    ev.target.complete()
  }

  async function handleRefresh(ev: any) {
    await inboxStore.getInboxBatch(true)
    ev.target.complete()
  }

  function checkQueryParams() {
    if (!hasFetchedInitial.value) return
    const item = route.query.item || queryParams.value?.get('item')
    if (!item) return

    const foundIdx = inbox.value.findIndex(val => item === val._id)
    if (foundIdx === -1) return

    setQueryParams(undefined)
    slide.value = foundIdx
    open.value = true
    EventBus.emit('goToSlide')
  }

  watch(isLoggedIn, fetchInitialInbox)
  watch(() => route.query, () => {
    if (route.query.item) checkQueryParams()
  })

  return {
    isLoading,
    inbox,
    isInboxLoading,
    allLoaded,
    groupedInboxItems,
    noMessages,
    fetchInitialInbox,
    loadMore,
    handleRefresh
  }
}