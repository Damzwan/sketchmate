<template>
  <button
    type="button"
    :disabled="disabled || busy"
    class="share-mate-row w-full flex items-center p-3 rounded-[2rem] border transition-[transform,opacity,border-color] duration-200 relative overflow-hidden text-left shadow-sm"
    :class="[
      disabled ? 'opacity-40 cursor-not-allowed grayscale' : '',
      busy ? 'opacity-50 cursor-wait' : 'active:scale-[0.98] cursor-pointer',
      selected ? 'scale-[0.99] shadow-inner' : '',
    ]"
    :style="rowStyle"
    @click="$emit('toggle')"
  >
    <div class="absolute inset-0 z-0 pointer-events-none">
      <ProfileWorld
        :world-id="customization.worldId"
        :accent="theme.accentColor"
        :font="fontFamily"
        static-mode
        mini
        contained
        radius-class="rounded-[2rem]"
      />
      <ProfileEffect
        :effect-id="customization.effectId"
        static-effect
        contained
        radius-class="rounded-[2rem]"
      />
    </div>

    <div class="relative z-10 shrink-0">
      <UserAvatar
        :user="friend"
        :customization="customization"
        size="sm"
        static
      />
    </div>

    <div class="relative z-10 flex flex-col ml-4 flex-1 min-w-0 px-1.5 py-1">
      <span class="text-lg font-black leading-none truncate" :style="nameStyle">
        {{ friend.name }}
      </span>
      <span
        v-if="disabled"
        class="text-xs font-bold text-red-500 uppercase tracking-widest mt-1"
      >
        Needs update
      </span>
      <span
        v-else-if="online"
        class="text-xs font-bold text-green-600 uppercase tracking-widest mt-1"
      >
        Online now
      </span>
    </div>

    <div
      v-if="!disabled"
      class="relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200"
      :style="selectionStyle"
    >
      <ion-icon v-if="selected" :icon="svg(mdiCheck)" class="text-base font-black" />
    </div>
  </button>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
import { computed } from "vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import {
	hydrateCustomization,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
	resolveWorld,
} from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";

const props = defineProps<{
	friend: any;
	selected: boolean;
	disabled: boolean;
	busy: boolean;
	online: boolean;
}>();

defineEmits<{ toggle: [] }>();

const customization = computed(() =>
	hydrateCustomization(props.friend?.customization),
);
const theme = computed(() => resolveTheme(customization.value.themeId));
const world = computed(() => resolveWorld(customization.value.worldId));
const fontFamily = computed(() =>
	resolveFontFamily(customization.value.fontId),
);
const surfacePalette = computed(() =>
	resolveReadableCustomizationPalette(theme.value, world.value),
);

const rowStyle = computed(() => ({
	background: theme.value.cardBg,
	borderColor: props.selected
		? "var(--ion-color-secondary)"
		: theme.value.cardBorderColor,
}));
const nameStyle = computed(() => ({
	color: surfacePalette.value.name,
	fontFamily: fontFamily.value,
	textShadow: surfacePalette.value.textShadow,
}));
const selectionStyle = computed(() => ({
	background: props.selected ? "var(--ion-color-secondary)" : "transparent",
	borderColor: props.selected
		? "var(--ion-color-secondary)"
		: surfacePalette.value.controlBorder,
	color: props.selected ? "#ffffff" : surfacePalette.value.controlForeground,
}));
</script>

<style scoped>
.share-mate-row {
	content-visibility: auto;
	contain-intrinsic-size: 74px;
}
</style>
