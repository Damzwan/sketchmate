<template>
  <ion-page class="slide-page">
    <SubPageBar title="Notifications" />

    <ion-content class="--background-custom">
      <div class="w-full max-w-2xl mx-auto px-4 pt-4 bot-pad-safe overflow-visible">

        <div
          v-if="!isLoading && notifications.length === 0"
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <ion-icon
            :icon="svg(mdiBellOutline)"
            class="text-5xl text-[var(--ion-color-dark)]/20 mb-3"
          />
          <p class="cabin-sketch-regular text-xl font-black text-[var(--ion-color-dark)]/50 tracking-tight leading-none">
            Nothing here yet
          </p>
          <p class="text-[10px] font-black uppercase tracking-widest text-[var(--ion-color-dark)]/30 mt-1">
            When something happens, you'll see it here.
          </p>
        </div>

        <div v-else-if="isLoading" class="space-y-3">
          <div
            v-for="i in 4"
            :key="i"
            class="h-20 rounded-[1.75rem] bg-[var(--ion-color-tertiary)]/60 border border-[var(--ion-color-dark)]/5"
          />
        </div>

        <template v-else>
          <div v-if="unread > 0" class="flex justify-end mb-3 px-1">
            <button
              @click="handleMarkAllRead"
              class="text-[9px] font-black uppercase tracking-widest text-[var(--ion-color-secondary)] hover:text-[var(--ion-color-secondary-shade)] active:scale-95 transition-transform px-3 py-1.5 rounded-full bg-white border border-primary/40 shadow-sm"
            >
              Mark all as read
            </button>
          </div>

          <section
            v-for="[group, entries] in groupedByDay"
            :key="group"
            class="mb-6 overflow-visible"
          >
            <h3 class="cabin-sketch-regular text-sm font-black text-[var(--ion-color-dark)]/40 px-2 mb-2 uppercase tracking-wider">
              {{ group }}
            </h3>

            <div class="space-y-2.5 overflow-visible">
              <NotificationCard
                v-for="n in entries"
                :key="n._id"
                :notification="n"
              />
            </div>
          </section>

          <ion-infinite-scroll
            v-if="hasMore"
            @ionInfinite="handleLoadMore"
            threshold="100px"
          >
            <ion-infinite-scroll-content loading-spinner="dots" />
          </ion-infinite-scroll>
        </template>

      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
	IonContent,
	IonInfiniteScroll,
	IonInfiniteScrollContent,
	IonPage,
	IonIcon,
	onIonViewWillEnter,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { mdiBellOutline } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import SubPageBar from "@/components/general/SubPageBar.vue";
import NotificationCard from "@/components/notification/NotificationCard.vue";
import { useInAppNotificationStore } from "@/store/inAppNotificationStore";

const store = useInAppNotificationStore();
const { notifications, isLoading, hasMore, groupedByDay, unread } =
	storeToRefs(store);

onIonViewWillEnter(() => {
	store.markAllSeen();
});

async function handleLoadMore(event: any) {
	await store.loadMore();
	event.target.complete();
}

async function handleMarkAllRead() {
	await store.markAllRead();
}
</script>

<style scoped>
.--background-custom {
  --background: var(--ion-color-background) !important;
}
</style>