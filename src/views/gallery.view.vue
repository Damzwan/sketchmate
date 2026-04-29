<template>
  <ion-page id="page">
    <div
      class="header-overlay"
      :class="{ 'header-hidden': multiSelectMode }"
    >
      <TopBar title="Gallery" />
    </div>

    <ion-content class="bg-background">

      <transition name="fade">
        <div v-if="multiSelectMode" class="selection-controls px-4">
          <div class="flex items-center bg-secondary rounded-full -ml-2 transition-transform active:scale-95">
            <ion-button
              fill="clear"
              class="h-9 w-9 --padding-start-0 --padding-end-0"
              @click="cancelMultiSelect"
            >
              <ion-icon
                slot="icon-only"
                :icon="svg(mdiClose)"
                class="text-white text-xl"
              />
            </ion-button>

            <span class="font-bold text-base pr-4 text-white tabular-nums">
        {{ selectedItems.length }}
      </span>
          </div>
        </div>
      </transition>

      <CircularLoader v-if="isLoading && inbox.length === 0" class="z-50" bgColor="bg-background" />

      <div v-else-if="user" class="w-full h-full">
        <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
          <ion-refresher-content></ion-refresher-content>
        </ion-refresher>

        <NoMessages
          v-if="noMessages && user.mates.length === 0"
          title="Start connecting"
          subtitle="Add a friend first before you can access your gallery"
          :img="connectImage"
          btn-text="Add a friend"
          :btn-link="FRONTEND_ROUTES.connect"
        />

        <NoMessages
          v-else-if="noMessages && !isInboxLoading"
          title="No messages.."
          subtitle="Send a drawing to a friend to see it over here"
          :img="noMessagesImg"
          btn-text="Start drawing"
          :btn-link="FRONTEND_ROUTES.draw"
        />

        <div class="h-full p-2" v-else>
          <div v-for="date in sortDates(Object.keys(groupedInboxItems))" :key="date" class="pb-3">
            <div class="text-xl font-bold px-2">
              {{ dayjs(date).format('MMMM, YYYY') }}
            </div>

            <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5 pt-3">
              <div
                v-for="(inboxItem, i) in groupedInboxItems[date]"
                :key="inboxItem._id"
                :class="inboxItem.aspect_ratio > 1 ? 'col-span-2' : 'col-span-1'"
              >
                <Thumbnail
                  :inbox-item="inboxItem"
                  :user="user!"
                  :multi-selected-items="selectedItems"
                  :multi-select-mode="multiSelectMode"
                  @long-press="() => onItemLongPress(inboxItem)"
                  @click="onThumbnailClick(inboxItem)"
                  @hover="seeItem(inboxItem)"
                  :eager="i < 8"
                />
              </div>
            </div>
          </div>

          <ion-infinite-scroll
            @ionInfinite="loadMore"
            :disabled="allLoaded"
          >
            <ion-infinite-scroll-content
              loading-spinner="crescent"
              loading-text="Looking back in time..."
            />
          </ion-infinite-scroll>
        </div>

        <GalleryActionSheet
          :selected-mode="multiSelectMode"
          :count="selectedItems.length"
          @cancel="cancelMultiSelect"
          @share="handleShare"
          @delete="alterTrigger.click()"
        />

        <div id="delete-multiple-images-alert" class="hidden" ref="alterTrigger" />
        <ConfirmationAlert
          header="Delete Drawings?"
          trigger="delete-multiple-images-alert"
          message="Selected sketches will be removed permanently for you."
          @confirm="deleteInboxItems"
        />
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import {
  IonContent, IonPage, IonRefresher, IonRefresherContent,
  IonInfiniteScroll, IonInfiniteScrollContent,
  onIonViewWillLeave, useBackButton, IonIcon
} from '@ionic/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import { Share } from '@capacitor/share'

// Helpers & Routes
import { sortDates, svg } from '@/helper/general.helper'
import router from '@/router'
import { useRoute } from 'vue-router'
import { EventBus } from '@/main'
import { FRONTEND_ROUTES } from '@/types/router.types'

// Components
import TopBar from '@/components/general/TopBar.vue'
import GalleryActionSheet from '@/components/gallery/GalleryActionSheet.vue'
import NoMessages from '@/components/gallery/NoMessages.vue'
import Thumbnail from '@/components/gallery/Thumbnail.vue'
import CircularLoader from '@/components/general/loaders/CircularLoader.vue'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import SubscriptionCard from '@/components/subscription/SubscriptionCard.vue'

// Assets
import noMessagesImg from '@/assets/illustrations/no_messages.webp'
import connectImage from '@/assets/illustrations/connect.webp'

// Stores & Services
import { useAuthStore } from '@/store/auth.store'
import { useInboxStore } from '@/store/inbox.store'
import { usePhotoSwiper } from '@/store/photoswiper.store'
import { useSessionStore } from '@/store/session.store'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { mdiClose } from '@mdi/js'

const api = useAPI()
const { toast } = useToast()
const route = useRoute()

const { user, isLoggedIn } = storeToRefs(useAuthStore())
const { queryParams } = storeToRefs(useSessionStore())
const { setQueryParams } = useSessionStore()
const { open, slide } = storeToRefs(usePhotoSwiper())
const { seeItem } = usePhotoSwiper()

// Inbox Store - New Pagination State
const { inbox, isInboxLoading, allLoaded, hasFetchedInitial } = storeToRefs(useInboxStore())
const { getInboxBatch, removeFromLocalInbox } = useInboxStore()

const isLoading = ref(true)
const page = ref()
const multiSelectMode = ref(false)
const selectedItems = ref<string[]>([])
const alterTrigger = ref<any>()

/**
 * INITIALIZATION
 */
onMounted(async () => {
  page.value = document.getElementById('page')
  await fetchInitialInbox()
})

watch(isLoggedIn, fetchInitialInbox)

async function fetchInitialInbox() {
  if (isLoggedIn.value && !hasFetchedInitial.value) {
    isLoading.value = true
    await getInboxBatch(true) // reset=true
    isLoading.value = false
    checkQueryParams()
  } else {
    isLoading.value = false
  }
}

/**
 * PAGINATION
 */
async function loadMore(ev: any) {
  await getInboxBatch()
  ev.target.complete()
}

async function handleRefresh(ev: any) {
  await getInboxBatch(true) // Reset cursor to newest
  ev.target.complete()
}

/**
 * DATA GROUPING
 */
const groupedInboxItems = computed(() => groupOnMonth(inbox.value))
const noMessages = computed(() => inbox.value.length === 0)

function groupOnMonth(items: any[]) {
  const inboxPerMonth: { [key: string]: any[] } = {}
  items.forEach(item => {
    const key = dayjs(item.date).format('YYYY-MM')
    if (!(key in inboxPerMonth)) inboxPerMonth[key] = []
    inboxPerMonth[key].push(item)
  })
  return inboxPerMonth
}

/**
 * MULTI-SELECT ACTIONS
 */
function onItemLongPress(item: any) {
  if (multiSelectMode.value) return

  // Haptic feedback for "pick up"
  if (window.navigator.vibrate) window.navigator.vibrate(40)

  multiSelectMode.value = true
  selectedItems.value.push(item._id)
}

function onThumbnailClick(item: any) {
  if (!multiSelectMode.value) {
    openPhotoSwiper(item)
  } else {
    const idx = selectedItems.value.indexOf(item._id)
    if (idx === -1) {
      selectedItems.value.push(item._id)
    } else {
      selectedItems.value.splice(idx, 1)
      if (selectedItems.value.length === 0) cancelMultiSelect()
    }
  }
}

function cancelMultiSelect() {
  multiSelectMode.value = false
  selectedItems.value = []
}

async function handleShare() {
  const itemsToShare = inbox.value.filter(i => selectedItems.value.includes(i._id))
  if (itemsToShare.length === 0) return

  try {
    await Share.share({
      title: 'Check out my sketches!',
      text: `Sharing ${itemsToShare.length} drawing(s) from Sketchmate.`,
      url: itemsToShare[0].image, // Share the main image link
      dialogTitle: 'Share with friends'
    })
  } catch (e) {
    console.error('Sharing error', e)
  }
}

async function deleteInboxItems() {
  const toDelete = [...selectedItems.value]
  cancelMultiSelect()

  // 1. Optimistic UI update
  toDelete.forEach(id => removeFromLocalInbox(id))
  toast(`Removing ${toDelete.length} drawings...`)

  // 2. Fire and forget backend calls
  try {
    await Promise.all(toDelete.map(id =>
      api.removeFromInbox({ user_id: user.value!._id, inbox_id: id })
    ))
  } catch (e) {
    toast('Some items could not be deleted.', { color: 'danger' })
    await getInboxBatch(true) // Re-sync if it fails
  }
}

/**
 * DEEP LINKING
 */
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

function openPhotoSwiper(inboxItem: any) {
  slide.value = inbox.value.findIndex(val => inboxItem._id === val._id)
  EventBus.emit('goToSlide')
  open.value = true
}

// Global back button handler
useBackButton(9999, (processNextHandler) => {
  if (multiSelectMode.value) cancelMultiSelect()
  else processNextHandler()
})

onIonViewWillLeave(cancelMultiSelect)

// Handle query param changes without page reload
watch(() => route.query, () => {
  if (route.query.item) checkQueryParams()
})
</script>

<style scoped lang="scss">
/* 1. Make the header an overlay that doesn't push content down */
.header-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  height: 56px; /* Match your TopBar height */
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  background: var(--ion-color-tertiary);
}

.header-hidden {
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}

.header-spacer {
  height: 56px;
  width: 100%;
}

.selection-controls {
  position: sticky;
  top: 0;
  z-index: 150;
  display: flex;
  align-items: center;
  height: 56px;
  background: var(--ion-background-color);
  border-bottom: 1px solid rgba(var(--ion-color-step-200), 0.1);
}


.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>