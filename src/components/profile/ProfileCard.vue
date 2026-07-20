<template>
  <section
    class="rounded-[3rem] border shadow-lg relative px-2 pb-2 pt-4 transition-[background-color,border-color] duration-500"
    :style="cardStyle"
  >
    <div v-if="!disableAmbient" class="absolute inset-0 rounded-[3rem] overflow-hidden pointer-events-none z-0">
      <ProfileWorld :key="worldRemountKey" :world-id="effectiveCustomization.worldId" :accent="theme.accentColor" :font="resolvedFontFamily" :static-mode="staticWorld" />
      <ProfileEffect :effect-id="effectiveCustomization.effectId" :static-effect="staticWorld" />
    </div>

    <div class="relative z-10" :style="{ fontFamily: resolvedFontFamily }">

      <div v-if="isOwnProfile && !isPreview" class="absolute top-0 right-0 flex items-center gap-1 z-50">

        <button
          type="button"
          @click="$emit('go-settings')"
          class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 active:scale-90 transition-all bg-white/25 backdrop-blur-md border border-black/5 shadow-sm hover:bg-white/45"
          aria-label="Settings"
        >
          <ion-icon :icon="svg(mdiCog)" class="w-5 h-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" :style="{'color': theme.accentColor}" />
        </button>

        <button
          type="button"
          @click="$emit('open-connection')"
          class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 active:scale-90 transition-all bg-white/25 backdrop-blur-md border border-black/5 shadow-sm hover:bg-white/45"
          aria-label="Add Connection"
        >
          <ion-icon :icon="svg(mdiAccountPlusOutline)" class="w-5 h-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" :style="{'color': theme.accentColor}" />
        </button>

        <button
          type="button"
          @click="$emit('go-customize')"
          class="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 active:scale-90 transition-all bg-white/25 backdrop-blur-md border border-black/5 shadow-sm hover:bg-white/45"
          aria-label="Customize"
        >
          <ion-icon :icon="svg(mdiPalette)" class="w-5 h-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" :style="{'color': theme.accentColor}" />
        </button>

      </div>

      <div class="flex flex-col items-center relative mt-2">
        <div
          ref="doodleZoneRef"
          class="js-doodle-zone relative w-full flex flex-col items-center py-6 transition-[transform,background-color]"
          :class="allowSketchEdit ? 'cursor-pointer rounded-[2rem] border-2 border-dashed hover:bg-black/[0.03] active:scale-[0.99]' : ''"
          :style="allowSketchEdit ? { borderColor: theme.cardBorderColor } : {}"
          role="button"
          :aria-label="allowSketchEdit ? 'Edit card doodle' : undefined"
          @click="allowSketchEdit && $emit('edit-sketch')"
        >
          <BackgroundSketch
            :path="effectiveCustomization.backgroundSketchPath"
            :view-box="effectiveCustomization.backgroundSketchViewBox"
            :stroke-color="activeColors.name"
            class="absolute inset-0 z-0"
          />

          <span
            v-if="allowSketchEdit"
            class="absolute top-2 right-2 z-40 flex items-center gap-1 px-2.5 py-1.5 rounded-full shadow-md border-2 transition-transform"
            :class="isDarkContext ? 'border-black/30 text-black/80' : 'border-white text-white'"
            :style="{ background: theme.accentColor }"
          >
            <ion-icon :icon="svg(mdiBrush)" class="w-3.5 h-3.5" />
            <span class="text-xs font-black uppercase tracking-widest">
              Doodle
            </span>
          </span>

          <div class="relative z-30 mb-6">
            <UserAvatar
              :user="user"
              :customization="effectiveCustomization"
              size="xl"
              :static="staticAvatarDecoration"
            />
          </div>

          <div class="text-center mt-4 w-full flex flex-col items-center relative z-10">
            <TitleBadge
              v-if="effectiveCustomization.titleId"
              :title-id="effectiveCustomization.titleId"
              :theme="theme"
              extra-class="mb-1"
            />
            <div v-else class="mt-4"/>

            <h2
              class="text-3xl mt-2 font-black drop-shadow-sm transition-colors duration-500"
              :style="{ color: activeColors.name }"
              :class="fontEffectClass"
            >
              {{ user.name }}
            </h2>

            <p
              class="text-base font-bold italic mt-3 px-4 leading-snug whitespace-pre-wrap transition-colors duration-500"
              :style="{ color: activeColors.desc }"
            >
              "{{ user.description || 'No description yet.' }}"
            </p>
          </div>
        </div>

        <template v-if="!isOwnProfile && !isPreview">
          <div class="flex gap-3 w-full mt-6 px-1">
            <ion-button
              expand="block"
              shape="round"
              class="flex-1 m-0 text-sm font-black uppercase tracking-widest transition-all duration-500"
              :style="{ '--background': theme.accentColor, '--color': '#ffffff' }"
              @click="$emit('add-friend')"
            >
              <ion-icon slot="start" :icon="svg(mdiAccountPlusOutline)" />
              Add Mate
            </ion-button>
            <ion-button
              expand="block"
              fill="outline"
              shape="round"
              class="flex-1 m-0 text-sm font-black uppercase tracking-widest transition-all duration-500"
              :style="{ '--color': activeColors.name, '--border-color': theme.cardBorderColor, '--border-width': '2px' }"
              @click="$emit('message')"
            >
              Message
            </ion-button>
          </div>
        </template>

        <div
          v-if="displayStats"
          class="grid grid-cols-3 w-full mt-6 border-t pt-4 transition-colors duration-500"
          :style="{ borderColor: theme.cardBorderColor }"
        >
          <button
            v-for="stat in (['mates', 'followers', 'following'] as const)"
            :key="stat"
            class="flex flex-col items-center cursor-pointer hover:scale-110 active:scale-95 transition-transform relative"
            :class="{ 'border-x': stat === 'followers' }"
            :style="stat === 'followers' ? { borderColor: theme.cardBorderColor } : {}"
            @click="$emit('go-network', stat)"
          >
            <span
              class="block text-xl font-black transition-colors duration-500"
              :style="{ color: stat === 'mates' ? theme.accentColor : activeColors.name }"
            >
              {{ formatStatNumber(getStatCount(stat)) }}
            </span>
            <span class="text-[11px] font-bold uppercase tracking-widest transition-colors duration-500" :style="{ color: activeColors.desc }">
              {{ stat }}
            </span>
          </button>
        </div>

        <div
          v-if="effectiveCustomization.signaturePath || allowSketchEdit"
          class="w-full mt-6 pt-4 border-t flex flex-col items-center transition-colors duration-500 relative"
          :style="{ borderColor: theme.cardBorderColor }"
        >
          <span
            class="text-[14px] font-bold uppercase tracking-widest mb-2 transition-colors duration-500"
            :style="{ color: activeColors.desc }"
          >
            — Signed —
          </span>

          <!-- Static display -->
          <svg
            v-if="!allowSketchEdit && effectiveCustomization.signaturePath"
            class="w-32 h-12 drop-shadow-sm transition-colors duration-500"
            :viewBox="effectiveCustomization.signatureViewBox || '0 0 300 150'"
            preserveAspectRatio="xMidYMid meet"
          >
            <path
              :d="effectiveCustomization.signaturePath"
              fill="none"
              :stroke="theme.accentColor"
              :stroke-width="signatureStrokeWidth"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <!-- Edit: the signature itself IS the button -->
          <button
            v-else-if="allowSketchEdit"
            type="button"
            @click="$emit('edit-signature')"
            class="group relative flex items-center justify-center w-44 h-16 rounded-[1.25rem] border-2 border-dashed cursor-pointer hover:scale-[1.03] active:scale-95 transition-all"
            :style="{ borderColor: theme.cardBorderColor }"
            aria-label="Edit signature"
          >
            <svg
              v-if="effectiveCustomization.signaturePath"
              class="w-32 h-12 drop-shadow-sm transition-colors duration-500"
              :viewBox="effectiveCustomization.signatureViewBox || '0 0 300 150'"
              preserveAspectRatio="xMidYMid meet"
            >
              <path
                :d="effectiveCustomization.signaturePath"
                fill="none"
                :stroke="theme.accentColor"
                :stroke-width="signatureStrokeWidth"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span
              v-else
              class="text-xs font-bold italic transition-colors duration-500"
              :style="{ color: activeColors.desc }"
            >
              Tap to sign
            </span>

            <span
              class="absolute -top-2 -right-2 z-40 flex items-center gap-1 px-2.5 py-1.5 rounded-full shadow-md border-2 transition-transform group-hover:scale-110"
              :class="isDarkContext ? 'border-black/30 text-black/80' : 'border-white text-white'"
              :style="{ background: theme.accentColor }"
            >
              <ion-icon :icon="svg(mdiDraw)" class="w-3.5 h-3.5" />
              <span class="text-xs font-black uppercase tracking-widest">
                Sign
              </span>
            </span>
          </button>
        </div>

      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiAccountPlusOutline,
	mdiBrush,
	mdiCog,
	mdiDraw,
	mdiPalette,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import BackgroundSketch from "@/components/profile/customization/BackgroundSketch.vue";
import TitleBadge from "@/components/profile/TitleBadge.vue";

import {
	calculateSignatureStroke,
	formatStatNumber,
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	isLightTheme,
	resolveWorld,
	type Customization,
} from "@/config/profile_options.config";

const props = withDefaults(
	defineProps<{
		user: any;
		customization?: Partial<Customization>;
		isOwnProfile?: boolean;
		isPreview?: boolean;
		allowSketchEdit?: boolean;
		worldRemountKey?: number | string;
		showStats?: boolean;
		/** Freeze the background world (no lottie/CSS motion) — e.g. behind the
		    doodle pad, where the animation drains perf and distracts. */
		staticWorld?: boolean;
		staticAvatarDecoration?: boolean;
		/** Skip the ambient world + effect layers entirely (not just freeze them).
		    Used behind the doodle pad, where dozens of sprite canvases + blur
		    re-composite on every zoom step and tank pan/zoom smoothness. */
		disableAmbient?: boolean;
	}>(),
	{
		isOwnProfile: false,
		isPreview: false,
		allowSketchEdit: false,
		worldRemountKey: 0,
		staticWorld: false,
		staticAvatarDecoration: false,
		disableAmbient: false,
	},
);

defineEmits([
	"go-settings",
	"go-customize",
	"go-network",
	"open-connection",
	"add-friend",
	"message",
	"edit-sketch",
	"edit-signature",
]);

const doodleZoneRef = ref<HTMLElement | null>(null);

const displayStats = computed(() => props.showStats ?? !props.isPreview);

const effectiveCustomization = computed(() =>
	hydrateCustomization(props.customization),
);
const theme = computed(() =>
	resolveTheme(effectiveCustomization.value.themeId),
);

const resolvedFontFamily = computed(() =>
	resolveFontFamily(effectiveCustomization.value.fontId),
);
const fontEffectClass = computed(() =>
	resolveFontEffectClass(effectiveCustomization.value.fontEffectId),
);

// Contrast resolution handling logic
const activeWorld = computed(() =>
	resolveWorld(effectiveCustomization.value.worldId),
);
const isWorldDark = computed(() => activeWorld.value.isDark === true);
const isDarkContext = computed(
	() => isWorldDark.value || !isLightTheme(theme.value),
);

const activeColors = computed(() => ({
	name: isWorldDark.value ? theme.value.nameColorDark : theme.value.nameColor,
	desc: isWorldDark.value ? theme.value.descColorDark : theme.value.descColor,
}));

const cardStyle = computed(() => ({
	background: theme.value.cardBg,
	borderColor: theme.value.cardBorderColor,
}));

const getStatCount = (key: "mates" | "followers" | "following") =>
	props.user.stats?.[key] || 0;
const signatureStrokeWidth = computed(() =>
	calculateSignatureStroke(effectiveCustomization.value.signatureViewBox),
);
</script>

<style scoped>

</style>