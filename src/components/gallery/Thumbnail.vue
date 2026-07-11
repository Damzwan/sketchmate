<template>
  <div
    ref="el"
    @click="onClick"
    class="relative flex justify-center cursor-pointer items-center h-full w-full select-none touch-pan-y overflow-visible"
    @mouseover="emits('hover')"
  >
    <div
      class="relative w-full overflow-hidden rounded-2xl ease-out bg-tertiary border shadow-sm group"
      :class="[
    multiSelectedItems.includes(itemId)
      ? 'border-secondary ring-2 ring-secondary/20 shadow-inner'
      : 'border-primary/40 hover:border-secondary/20 hover:shadow-md'
  ]"
      :style="{ height: inboxItem.aspect_ratio ? `${renderHeight}px` : '110px' }"
    >
      <img
        :src="inboxItem.thumbnail"
        :alt="inboxItem.date"
        @contextmenu.prevent
        @load="isLoading = false"
        :loading="props.eager ? 'eager' : 'lazy'"
        class="w-full h-full relative object-contain pointer-events-none transition-all duration-300"
        :class="[
          multiSelectedItems.includes(itemId) ? 'opacity-50 blur-[1px]' : 'opacity-100'
        ]"
      />

      <div
        class="z-30 absolute inset-0 flex justify-center items-center bg-tertiary"
        v-if="isLoading"
      >
        <ion-skeleton-text :animated="true" class="w-full h-full m-0 opacity-40" />
      </div>

      <div v-if="!isLoading" class="absolute inset-0 pointer-events-none z-10">

        <div
          v-if="multiSelectMode"
          class="absolute left-2 top-2 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm border"
          :class="multiSelectedItems.includes(itemId)
            ? 'bg-secondary border-secondary scale-110'
            : 'bg-white/70 backdrop-blur-md border-black/10 scale-100'"
        >
          <ion-icon
            :icon="svg(multiSelectedItems.includes(itemId) ? mdiCheckboxMarkedCircleOutline : mdiCheckboxBlankCircleOutline)"
            :class="multiSelectedItems.includes(itemId) ? 'text-white' : 'text-black/30'"
            class="text-base"
          />
        </div>

        <div class="absolute right-2 top-2 flex -space-x-2.5 pointer-events-auto overflow-visible">
          <img
            v-for="(follower, i) in [...inboxItem.followers].reverse().slice(0, badgesCountToShow)"
            :key="follower"
            :src="senderImg(findUserInInboxUsers(follower))"
            class="w-6 h-6 rounded-full border border-white shadow-sm object-cover transition-transform group-hover:scale-105"
            :style="{ zIndex: i, transform: `translateX(${i * 1.5}px)` }"
          >
          <div
            v-if="inboxItem.followers.length > badgesCountToShow"
            class="w-6 h-6 rounded-full border border-white bg-white/90 backdrop-blur-sm flex justify-center items-center shadow-sm"
            :style="{ zIndex: badgesCountToShow }"
          >
            <span class="text-[8px] font-black text-black/60">
              +{{ inboxItem.followers.length - badgesCountToShow }}
            </span>
          </div>
        </div>

        <div
          class="absolute left-2.5 top-2.5 w-2 h-2 bg-secondary rounded-full border border-white shadow-sm animate-pulse z-20"
          v-if="isNew && !multiSelectMode"
        />

        <div
          v-if="props.inboxItem.comments.length > 0"
          class="absolute right-2 bottom-2 px-1.5 py-0.5 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-sm text-white shadow-sm pointer-events-auto transition-all active:scale-90 group-hover:bg-secondary"
        >
          <div class="w-1 h-1 bg-green-400 rounded-full animate-ping" v-if="isNewComment" />
          <span class="text-[9px] font-black tracking-tight leading-none mb-[0.5px]">
            {{ props.inboxItem.comment_count }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, onUnmounted, watch } from "vue";
import { IonIcon, IonSkeletonText } from "@ionic/vue";
import { InboxItem, User } from "@/types/server.types";
import { isMobile, isNative, senderImg, svg } from "@/helper/general.helper";
import { onLongPress } from "@vueuse/core";
import {
	mdiCheckboxBlankCircleOutline,
	mdiCheckboxMarkedCircleOutline,
} from "@mdi/js";
import { useInboxStore } from "@/store/inbox.store";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

const props = defineProps<{
	inboxItem: InboxItem;
	user: User;
	multiSelectMode: boolean;
	multiSelectedItems: string[];
	eager: boolean;
}>();

const emits = defineEmits(["long-press", "click", "hover"]);

const itemId = computed(() => props.inboxItem._id);

watch(
	() => props.multiSelectedItems.includes(itemId.value),
	(isSelected, oldVal) => {
		if (props.multiSelectMode && oldVal !== undefined) {
			if (isNative())
				Haptics.impact({
					style: isSelected ? ImpactStyle.Medium : ImpactStyle.Light,
				});
		}
	},
);

const el = ref<HTMLElement | null>(null);
const renderHeight = ref(110);
const isLoading = ref(true);
const badgesCountToShow = 2;
const { findUserInInboxUsers } = useInboxStore();

let cancelClick = false;
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
	resizeObserver = new ResizeObserver((entries) => {
		for (const entry of entries) {
			if (!props.inboxItem.aspect_ratio) return;
			// Added a density modifier constraint to keep heights ergonomically compact on landscape frames
			const baseHeight = entry.contentRect.width / props.inboxItem.aspect_ratio;
			renderHeight.value = Math.max(85, Math.min(baseHeight, 140));
		}
	});
	if (el.value) resizeObserver.observe(el.value);
});

onUnmounted(() => resizeObserver?.disconnect());

async function onClick() {
	if (cancelClick) {
		cancelClick = false;
		return;
	}
	if (isNative()) await Haptics.impact({ style: ImpactStyle.Light });
	emits("click");
}

onLongPress(
	el,
	async () => {
		if (!isMobile()) cancelClick = true;
		if (isNative()) await Haptics.impact({ style: ImpactStyle.Heavy });
		emits("long-press");
	},
	{
		modifiers: { prevent: true },
		delay: 450,
	},
);

const isNew = computed(() => !props.inboxItem.seen_by.includes(props.user._id));
const isNewComment = computed(
	() => !props.inboxItem.comments_seen_by.includes(props.user._id),
);
</script>

<style scoped>
* {
  -webkit-touch-callout: none !important;
  -webkit-user-select: none !important;
  -webkit-tap-highlight-color: transparent !important;
  user-select: none !important;
}
.touch-pan-y {
  touch-action: pan-y;
}
img {
  -webkit-user-drag: none;
  pointer-events: none;
}
</style>