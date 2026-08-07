<!-- components/chat/ChatToastItem.vue -->
<template>
  <div
    class="relative flex items-start p-2.5 rounded-xl border shadow-2xl overflow-hidden transition-all active:scale-[0.98]"
    :class="wrapperClass"
    :style="wrapperStyle"
  >
    <!-- Every sender keeps their own customization. Worlds are frozen frames;
         effects may animate, but the toast stack is capped at three items. -->
    <div v-if="isCustomized" class="absolute inset-0 z-0 pointer-events-none" style="isolation: isolate;">
      <!-- Kept static-mode to prevent heavy Lottie decoding -->
      <ProfileWorld
        :world-id="customProps.customization.worldId"
        :accent="customProps.theme.accentColor"
        static-mode
        mini
        contained
        radius-class="rounded-xl"
      />
      <ProfileEffect
        :effect-id="customProps.customization.effectId"
        radius-class="rounded-xl"
        contained
      />
    </div>

    <!-- Dynamic Side Border Color (Standard Toasts Only) -->
    <div v-if="!isCustomized" class="absolute left-0 top-0 bottom-0 w-1" :class="borderColor"></div>

    <!-- Avatar -->
    <div class="relative z-10 shrink-0 ml-1 flex items-center justify-center">
      <UserAvatar
        :user="sender"
        :img="sender.img"
        :customization="isCustomized ? customProps.customization : undefined"
        size="xs"
        :static="!isCustomized"
      />

      <!-- Mini Icon Overlay -->
      <div v-if="toast.isTrial || toast.isMateProposal"
           class="absolute -bottom-1 -right-1 rounded-full p-0.5 border border-zinc-900 z-20"
           :class="toast.isMateProposal ? 'bg-secondary' : 'bg-secondary'">
        <ion-icon
          :icon="svg(toast.isMateProposal ? mdiHeart : mdiClockOutline)"
          class="text-[8px] text-white"
        />
      </div>
    </div>

    <!-- Text Content -->
    <div
      class="relative z-10 flex-1 min-w-0 ml-2.5 flex flex-col rounded-lg px-2 py-1"
      :style="isCustomized
        ? {
            fontFamily: customProps.font,
            background: customProps.palette.scrim,
          }
        : {}"
    >
      <div class="flex items-center justify-between mb-0.5">
        <!-- Subtitle (Name) -->
        <span class="text-[12px] leading-tight font-black uppercase tracking-wide truncate"
              :class="isCustomized ? customProps.fontClass : 'text-white/50'"
              :style="isCustomized
                ? {
                    color: customProps.palette.name,
                    textShadow: customProps.fontClass
                      ? undefined
                      : customProps.palette.textShadow,
                  }
                : {}">
          {{ toast.subtitle }}
          <span v-if="customProps.title || toast.title" :class="isCustomized ? 'opacity-80' : 'text-white/30'">
            · {{ customProps.title || toast.title }}
          </span>
        </span>

        <!-- Contextual Badges -->
        <span v-if="toast.isRequest || toast.isMateProposal"
              class="text-[7px] font-black bg-secondary px-1.5 py-0.5 rounded text-white uppercase animate-pulse">
          {{ toast.isMateProposal ? 'Mate Proposal' : 'New Request' }}
        </span>
      </div>

      <!-- Message Lines -->
      <div class="flex flex-col">
        <TransitionGroup name="line-slide">
          <p v-for="line in normalizedLines" :key="line.id"
             class="text-[13px] leading-tight cabin-sketch-regular font-bold tracking-wide break-words"
             :class="isCustomized ? '' : 'text-white/90'"
             :style="isCustomized
               ? {
                   color: customProps.palette.desc,
                   textShadow: customProps.palette.textShadow,
                 }
               : {}">
            {{ line.text }}
          </p>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiClockOutline, mdiHeart } from "@mdi/js";
import { type CSSProperties, computed } from "vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue"; // <-- Imported UserAvatar
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import { resolveSenderStyle } from "@/composables/chat/useSenderStyle";
import {
	resolveReadableCustomizationPalette,
	resolveWorld,
} from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import { useUserCacheStore } from "@/store/userCache.store";

const props = defineProps<{
	toast: any;
}>();

const userCache = useUserCacheStore();
const cachedSender = computed(() =>
	props.toast.senderId ? userCache.getUser(props.toast.senderId) : undefined,
);
const sender = computed(() => {
	const cached = cachedSender.value;
	return {
		...cached,
		_id: props.toast.senderId || cached?._id || "toast-sender",
		name: props.toast.subtitle || cached?.name || "Artist",
		img: props.toast.img || cached?.img || "",
		// The socket snapshot wins because it represents the exact sender state
		// at notification time. Cache is the recovery path for partial events.
		customization: props.toast.customization ?? cached?.customization,
	};
});

// User-authored lobby messages deserve the sender's surface too. Only a toast
// with neither a customization snapshot nor a resolvable sender stays generic.
const isCustomized = computed(
	() =>
		!!(
			props.toast.senderId ||
			sender.value.customization ||
			cachedSender.value?.customization
		),
);

const normalizedLines = computed(() => {
	if (props.toast.lines && props.toast.lines.length) return props.toast.lines;
	if (props.toast.text) return [{ id: "1", text: props.toast.text }];
	return [];
});

const customProps = computed(() => {
	const style = resolveSenderStyle(sender.value);
	const world = resolveWorld(style.customization.worldId);
	return {
		customization: style.customization,
		theme: style.theme,
		palette: resolveReadableCustomizationPalette(style.theme, world),
		font: style.fontFamily,
		fontClass: style.fontEffectClass,
		title: style.title,
	};
});

const wrapperClass = computed(() => {
	if (isCustomized.value) return "border-black/10";
	return "bg-zinc-900/80 backdrop-blur-xl border-white/10";
});

const wrapperStyle = computed<CSSProperties>(() => {
	if (isCustomized.value) {
		return {
			background: customProps.value.theme.cardBg,
			borderColor: customProps.value.theme.cardBorderColor,
			transform: "translateZ(0)",
			isolation: "isolate",
		};
	}
	return { transform: "translateZ(0)" };
});

const borderColor = computed(() => {
	if (props.toast.tabId?.startsWith("lobby")) return "bg-cyan-400";
	if (props.toast.isMateProposal) return "bg-secondary animate-pulse";
	if (props.toast.isRequest) return "bg-secondary";
	if (props.toast.isTrial) return "bg-amber-400";
	return "bg-secondary";
});
</script>

<style scoped>
.line-slide-enter-active {
  transition: all 0.3s ease-out;
}
.line-slide-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.cabin-sketch-regular {
  font-family: 'cabin-sketch-regular', sans-serif;
}
</style>
