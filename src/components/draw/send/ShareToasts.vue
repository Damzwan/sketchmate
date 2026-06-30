<!-- components/ShareToasts.vue -->
<template>
  <div class="fixed top-safe mt-20 right-4 z-[100] flex flex-col gap-2 w-64 pointer-events-none">
    <TransitionGroup name="share-toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        @click.stop="onTap(toast)"
        class="relative flex items-center p-2.5 rounded-xl border backdrop-blur-xl shadow-2xl pointer-events-auto cursor-pointer overflow-hidden transition-all active:scale-[0.98] bg-zinc-900/80 border-white/10"
      >
        <!-- Dynamic Side Border Color -->
        <div class="absolute left-0 top-0 bottom-0 w-1" :class="borderColor(toast.kind)"></div>

        <!-- Visual: thumbnail for drawing/post, lottie for balloon -->
        <div class="relative shrink-0 ml-1">
          <template v-if="toast.kind === 'balloon'">
            <div class="w-10 h-10 flex items-center justify-center -my-1">
              <Lottie
                :json="balloonLottie"
                :loop="true"
                :speed="0.5"
                class="h-10 w-10"
              />
            </div>
          </template>

          <template v-else-if="toast.kind === 'title'">
            <div class="w-10 h-10 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-xl shadow-md">
              {{ toast.emoji }}
            </div>
          </template>

          <template v-else>
            <img
              :src="toast.thumbnail"
              class="w-8 h-8 rounded-lg object-cover border border-white/10 shadow-md bg-white/5"
            />
            <div
              class="absolute -bottom-1 -right-1 rounded-full p-0.5 border border-zinc-900 bg-secondary"
            >
              <ion-icon :icon="svg(mdiCheck)" class="text-[8px] text-white" />
            </div>
          </template>
        </div>

        <div class="flex-1 min-w-0 ml-2.5 flex flex-col">
          <div class="flex items-center justify-between mb-0.5">
            <span class="text-[9px] font-black text-white/50 uppercase tracking-widest">
              {{ kindLabel(toast.kind) }}
            </span>
            <span
              v-if="toast.kind !== 'balloon' && toast.kind !== 'title'"
              class="text-[7px] font-black text-white/40 uppercase"
            >
              Tap to view
            </span>
          </div>
          <p class="text-[13px] text-white leading-tight cabin-sketch-regular font-bold tracking-wide">
            {{ toast.title }}
          </p>
          <p class="text-[11px] text-white/70 leading-tight cabin-sketch-regular font-bold tracking-wide truncate">
            {{ toast.subtitle }}
          </p>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { IonIcon } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import balloonLottie from "@/assets/lottie/balloon.json";
import {
	ShareToast,
	ShareToastKind,
	useShareToastStore,
} from "@/draw/store/useShareToastStore.store";
import { useInboxSwiper } from "@/composables/gallery/useInboxSwiper";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import Lottie from "@/components/general/Lottie.vue";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";

const shareToastStore = useShareToastStore();
const { toasts } = storeToRefs(shareToastStore);

const inboxSwiper = useInboxSwiper();
const postSwiper = usePostSwiper();

const borderColor = (kind: ShareToastKind) => {
	switch (kind) {
		case "drawing":
			return "bg-secondary";
		case "post":
			return "bg-cyan-400";
		case "balloon":
			return "bg-amber-400 animate-pulse";
		case "saved":
			return "bg-emerald-400"; // Fresh green for success
		case "title":
			return "bg-fuchsia-400";
	}
};

const kindLabel = (kind: ShareToastKind) => {
	switch (kind) {
		case "drawing":
			return "Direct";
		case "post":
			return "Community";
		case "balloon":
			return "Balloon";
		case "saved":
			return "Library";
		case "title":
			return "Title Earned";
	}
};

const onTap = (toast: ShareToast) => {
	shareToastStore.dismiss(toast.id);

	if (toast.kind === "drawing" && toast.inboxId) {
		const item = shareToastStore.getInboxItem(toast.inboxId);
		if (item) {
			inboxSwiper.openInboxSwiper([item], 0);
		}
		return;
	}

	if (toast.kind === "post" && toast.postId) {
		const post = shareToastStore.getPost(toast.postId);
		if (post) {
			postSwiper.openPostSwiper([post], 0);
		}
		return;
	}

	if (toast.kind === "balloon") {
		useMenuStore().openMenu(Menu.BalloonMenu);
		return;
	}

	if (toast.kind === "saved") {
		useMenuStore().openMenu(Menu.StickerEmblemSaved);
		return;
	}
};
</script>

<style scoped>
.share-toast-enter-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.share-toast-leave-active {
  transition: all 0.6s ease-in;
  position: absolute;
  width: 100%;
}
.share-toast-move {
  transition: transform 0.4s ease;
}
.share-toast-enter-from {
  opacity: 0;
  transform: translateX(60px) scale(0.9);
}
.share-toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
  filter: blur(8px);
}
.cabin-sketch-regular {
  font-family: 'cabin-sketch-regular', sans-serif;
}
</style>