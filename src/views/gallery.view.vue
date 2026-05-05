<template>
  <ion-page id="page">
    <!-- Top Bar: Smooth slide-out when multi-selecting -->
    <div
      class="top-0 left-0 right-0 z-[200] h-[56px] transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] bg-[var(--ion-color-tertiary)]"
      :class="{ '-translate-y-full opacity-0 pointer-events-none': multiSelectMode }"
    >
      <TopBar title="Gallery" />
    </div>

    <ion-content >
      <!-- Multi-Select Contextual Header -->
      <transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200"
        leave-to-class="opacity-0"
      >
        <div
          v-if="multiSelectMode"
          @click="cancelMultiSelect"
          class="fixed top-safe left-2 right-0 z-[150] cursor-pointer flex items-center h-[56px] bg-[var(--ion-background-color)] border-b border-white/10 px-4"
        >
          <div class="flex items-center bg-secondary rounded-full -ml-2 transition-transform active:scale-95">
            <ion-button fill="clear" class="h-9 w-9 --padding-start-0 --padding-end-0">
              <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="text-white text-xl" />
            </ion-button>
            <span class="font-bold text-base pr-4 text-white tabular-nums">
              {{ selectedItems.length }}
            </span>
          </div>
        </div>
      </transition>

      <div :class="{'pt-[56px]': isNative()}" class="h-full">
        <CircularLoader v-if="isLoading && inbox.length === 0" class="z-50" bgColor="bg-background" />

        <div v-else-if="user" class="w-full h-full">
          <ion-refresher
            slot="fixed"
            @ionRefresh="handleRefresh"
            class="z-[300]"
          >
            <ion-refresher-content
              refreshing-spinner="circular"
            />
          </ion-refresher>

          <!-- Empty States -->
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

          <!-- Gallery Grid -->
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
              threshold="50%"
              position="bottom"
            >
              <ion-infinite-scroll-content
                loading-spinner="crescent"
                loading-text="Looking back in time..."
              />
            </ion-infinite-scroll>
          </div>
        </div>
      </div>

      <!-- Actions & Alerts -->
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
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import {
  IonContent, IonPage, IonRefresher, IonRefresherContent,
  IonInfiniteScroll, IonInfiniteScrollContent,
  onIonViewWillLeave, useBackButton, IonIcon, IonButton
} from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'

import { isNative, sortDates, svg } from '@/helper/general.helper'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { mdiChevronDown, mdiClose } from '@mdi/js'

import TopBar from '@/components/general/TopBar.vue'
import GalleryActionSheet from '@/components/gallery/GalleryActionSheet.vue'
import NoMessages from '@/components/gallery/NoMessages.vue'
import Thumbnail from '@/components/gallery/Thumbnail.vue'
import CircularLoader from '@/components/general/loaders/CircularLoader.vue'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'

import noMessagesImg from '@/assets/illustrations/no_messages.webp'
import connectImage from '@/assets/illustrations/connect.webp'

import { useAuthStore } from '@/store/auth.store'
import { useInboxSwiper } from '@/composables/gallery/useInboxSwiper'
import { useGalleryData } from '@/composables/gallery/useGalleryData'
import { useGallerySelection } from '@/composables/gallery/useGallerySelection'

const { user } = storeToRefs(useAuthStore())

// Logic Hooks
const { openInboxSwiper, seeItem } = useInboxSwiper()
const triggerSwiper = (item: any) => {
  const index = inbox.value.findIndex(val => item._id === val._id)
  openInboxSwiper(inbox.value, index)
}

const {
  isLoading, inbox, isInboxLoading, allLoaded,
  groupedInboxItems, noMessages,
  fetchInitialInbox, loadMore, handleRefresh
} = useGalleryData()

const {
  multiSelectMode, selectedItems, alterTrigger,
  onItemLongPress, onThumbnailClick, cancelMultiSelect,
  handleShare, deleteInboxItems
} = useGallerySelection(user, inbox, triggerSwiper)

onMounted(fetchInitialInbox)

// Handle native hardware back button
useBackButton(9999, (processNextHandler) => {
  if (multiSelectMode.value) cancelMultiSelect()
  else processNextHandler()
})

// Clean up selection state when navigating away
onIonViewWillLeave(cancelMultiSelect)
</script>

<style scoped>
/* Ensure tabular numbers for the selection counter so it doesn't jump */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* Background refinement for the ion-content */
ion-content {
  --background: var(--ion-background-color);
}

ion-refresher {
  --color: var(--ion-color-secondary);
}

ion-refresher-content {
  --ion-color-primary: var(--ion-color-secondary);
}
</style>