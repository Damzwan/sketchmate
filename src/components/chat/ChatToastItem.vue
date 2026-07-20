<!-- components/chat/ChatToastItem.vue -->
<template>
  <div
    class="relative flex items-start p-2.5 rounded-xl border shadow-2xl overflow-hidden transition-all active:scale-[0.98]"
    :class="wrapperClass"
    :style="wrapperStyle"
  >
    <!-- Themed Background & Ambient Layers (Join Events Only) -->
    <div v-if="toast.isJoin" class="absolute inset-0 z-0 pointer-events-none" style="isolation: isolate;">
      <!-- Removed static-effect so shimmer and glass sweeps can animate -->
      <ProfileEffect
        :effect-id="customProps.customization.effectId"
        radius-class="rounded-xl"
        contained
      />
      <!-- Kept static-mode to prevent heavy Lottie decoding -->
      <ProfileWorld
        :world-id="customProps.customization.worldId"
        :accent="customProps.theme.accentColor"
        static-mode
        mini
        contained
        radius-class="rounded-xl"
      />
    </div>

    <!-- Dynamic Side Border Color (Standard Toasts Only) -->
    <div v-if="!toast.isJoin" class="absolute left-0 top-0 bottom-0 w-1" :class="borderColor"></div>

    <!-- Avatar -->
    <div class="relative z-10 shrink-0 ml-1 flex items-center justify-center">
      <UserAvatar
        :img="toast.img"
        :customization="toast.isJoin ? customProps.customization : undefined"
        size="xs"
        :static="!toast.isJoin"
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
    <div class="relative z-10 flex-1 min-w-0 ml-2.5 flex flex-col" :style="toast.isJoin ? { fontFamily: customProps.font } : {}">
      <div class="flex items-center justify-between mb-0.5">
        <!-- Subtitle (Name) -->
        <span class="text-[9px] font-black uppercase tracking-widest truncate"
              :class="toast.isJoin ? [customProps.fontClass, 'drop-shadow-sm'] : 'text-white/50'"
              :style="toast.isJoin ? { color: customProps.nameColor } : {}">
          {{ toast.subtitle }}
          <span v-if="toast.title" :class="toast.isJoin ? 'opacity-60' : 'text-white/30'"> · {{ toast.title }}</span>
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
             :class="toast.isJoin ? 'drop-shadow-sm' : 'text-white/90'"
             :style="toast.isJoin ? { color: customProps.descColor } : {}">
            {{ line.text }}
          </p>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonIcon } from "@ionic/vue";
import { mdiClockOutline, mdiHeart } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue"; // <-- Imported UserAvatar
import {
  hydrateCustomization,
  resolveFontEffectClass,
  resolveFontFamily,
  resolveTheme,
  resolveWorld,
} from "@/config/profile_options.config";

const props = defineProps<{
  toast: any;
}>();

const normalizedLines = computed(() => {
  if (props.toast.lines && props.toast.lines.length) return props.toast.lines;
  if (props.toast.text) return [{ id: "1", text: props.toast.text }];
  return [];
});

const customProps = computed(() => {
  if (!props.toast.isJoin) return {} as any;

  const custom = hydrateCustomization(props.toast.customization);
  const theme = resolveTheme(custom.themeId);
  const world = resolveWorld(custom.worldId);
  const isDarkWorld = world.isDark === true;

  return {
    customization: custom,
    theme,
    nameColor: isDarkWorld ? theme.nameColorDark : theme.nameColor,
    descColor: isDarkWorld ? theme.descColorDark : theme.descColor,
    font: resolveFontFamily(custom.fontId),
    fontClass: resolveFontEffectClass(custom.fontEffectId),
  };
});

const wrapperClass = computed(() => {
  if (props.toast.isJoin) return "border-black/5";
  return "bg-zinc-900/80 backdrop-blur-xl border-white/10";
});

const wrapperStyle = computed(() => {
  if (props.toast.isJoin) {
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