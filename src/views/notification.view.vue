<template>
  <ion-page class="slide-page">
    <SubPageBar title="Notifications" />

    <ion-content class="bg-background">
      <div class="w-full max-w-3xl mx-auto px-6 pt-6 bot-pad-safe">

        <!-- Empty state -->
        <div
          v-if="!isLoading && notifications.length === 0"
          class="flex flex-col items-center justify-center py-24 text-center"
        >
          <ion-icon
            :icon="svg(mdiBellOutline)"
            class="text-6xl text-black/20 mb-4"
          />
          <p class="cabin-sketch-regular text-xl text-black/40">
            Nothing yet
          </p>
          <p class="text-sm text-black/30 mt-1">
            When something happens, you'll find it here.
          </p>
        </div>

        <!-- Loading skeleton -->
        <div v-else-if="isLoading" class="space-y-3">
          <div
            v-for="i in 5"
            :key="i"
            class="h-20 rounded-[2rem] bg-primary/5 animate-pulse"
          />
        </div>

        <!-- Grouped feed -->
        <template v-else>
          <!-- Mark all as read — only shown when there's something to clear -->
          <div v-if="unread > 0" class="flex justify-end mb-4">
            <button
              @click="handleMarkAllRead"
              class="text-xs font-black uppercase tracking-widest text-black/50 active:opacity-60 transition-opacity px-3 py-2 rounded-full bg-primary/5 border border-black/5"
            >
              Mark all as read
            </button>
          </div>

          <section
            v-for="[group, entries] in groupedByDay"
            :key="group"
            class="mb-8"
          >
            <h3 class="cabin-sketch-regular text-lg font-bold text-black/40 px-2 mb-3 uppercase tracking-wider">
              {{ group }}
            </h3>
            <div class="space-y-2.5">
              <NotificationCard
                v-for="n in entries"
                :key="n._id"
                :notification="n"
              />
            </div>
          </section>

          <!-- Load more sentinel -->
          <ion-infinite-scroll
            v-if="hasMore"
            @ionInfinite="handleLoadMore"
            threshold="150px"
          >
            <ion-infinite-scroll-content loading-spinner="bubbles" />
          </ion-infinite-scroll>
        </template>

      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonPage,
  onIonViewWillEnter
} from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { mdiBellOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'

import SubPageBar from '@/components/general/SubPageBar.vue'
import NotificationCard from '@/components/notification/NotificationCard.vue'
import { useInAppNotificationStore } from '@/store/inAppNotificationStore'

const store = useInAppNotificationStore();
const { notifications, isLoading, hasMore, groupedByDay, unread } = storeToRefs(store);

onIonViewWillEnter(() => {
  store.markAllSeen();
})

async function handleLoadMore(event: any) {
  await store.loadMore();
  event.target.complete();
}

async function handleMarkAllRead() {
  await store.markAllRead();
}
</script>

<style scoped>
@reference "@/theme/main.css";
</style>