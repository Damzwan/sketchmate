<template>
  <section
    class="rounded-[3rem] border-2 shadow-lg relative px-2 pb-2 pt-4 transition-all duration-500"
    :style="cardStyle"
  >
    <!-- Background Effects -->
    <div class="absolute inset-0 rounded-[3rem] overflow-hidden pointer-events-none z-0">
      <ProfileEffect :effect-id="effectiveCustomization.effectId" />
      <ProfileAtmosphere :atmosphere-id="effectiveCustomization.atmosphereId" />
    </div>

    <div class="relative z-10" :style="{ fontFamily: resolvedFontFamily }">

      <!-- Top Right Hub: Settings, Add/Share, Customize -->
      <div v-if="isOwnProfile && !isPreview" class="absolute top-2 right-2 flex items-center gap-2 z-20">

        <ion-button
          @click="$emit('go-settings')"
          fill="clear"
        >
          <ion-icon :icon="svg(mdiCog)" class="text-base w-5 h-5" :style="{'color': theme.accentColor}" slot="icon-only" />
        </ion-button>

        <ion-button
          @click="$emit('open-connection')"
          fill="clear"
        >
          <ion-icon :icon="svg(mdiAccountPlusOutline)" class="text-base w-5 h-5" slot="icon-only" :style="{'color': theme.accentColor}"  />
        </ion-button>

        <ion-button
          @click="$emit('go-customize')"
          fill="clear"
        >
          <ion-icon :icon="svg(mdiPalette)" class="text-base w-5 h-5" slot="icon-only" :style="{'color': theme.accentColor}"  />
        </ion-button>

      </div>

      <!-- Main Profile Context -->
      <div class="flex flex-col items-center relative mt-2">
        <div ref="doodleZoneRef" class="js-doodle-zone relative w-full flex flex-col items-center py-6">
          <BackgroundSketch
            :path="effectiveCustomization.backgroundSketchPath"
            :view-box="effectiveCustomization.backgroundSketchViewBox"
            :stroke-color="theme.nameColor"
            class="absolute inset-0 z-0"
          />

          <div class="relative z-30 mb-6">
            <UserAvatar
              :user="user"
              :customization="effectiveCustomization"
              size="xl"
            />
          </div>

          <div class="text-center mt-4 w-full flex flex-col items-center relative z-10">
            <span
              v-if="displayTitle"
              class="text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full mb-1 transition-colors duration-500"
              :style="{ background: theme.titleBg, color: theme.nameColor }"
            >
              {{ displayTitle }}
            </span>

            <h2
              class="text-3xl font-black drop-shadow-sm transition-colors duration-500"
              :style="{ color: theme.nameColor }"
              :class="fontEffectClass"
            >
              {{ user.name }}
            </h2>

            <p
              class="text-sm font-bold italic mt-3 px-4 leading-snug whitespace-pre-wrap transition-colors duration-500"
              :style="{ color: theme.descColor }"
            >
              "{{ user.description || 'No description yet.' }}"
            </p>
          </div>
        </div>

        <!-- Social Connections (Visits Alternative View profiles Only) -->
        <template v-if="!isOwnProfile && !isPreview">
          <div class="flex gap-3 w-full mt-6 px-1">
            <ion-button
              expand="block"
              shape="round"
              class="flex-1 m-0 text-sm font-black uppercase tracking-widest shadow-md transition-all duration-500"
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
              :style="{ '--color': theme.nameColor, '--border-color': theme.cardBorderColor, '--border-width': '2px' }"
              @click="$emit('message')"
            >
              Message
            </ion-button>
          </div>
        </template>

        <!-- Stats Section Summary -->
        <div
          v-if="!isPreview"
          class="grid grid-cols-3 w-full mt-6 border-t pt-4 transition-colors duration-500"
          :style="{ borderColor: theme.cardBorderColor }"
        >
          <button
            v-for="stat in (['mates', 'followers', 'following'] as const)"
            :key="stat"
            class="flex flex-col items-center active:scale-95 transition-transform relative"
            :class="{ 'border-x': stat === 'followers' }"
            :style="stat === 'followers' ? { borderColor: theme.cardBorderColor } : {}"
            @click="$emit('go-network', stat)"
          >
            <span
              class="block text-xl font-black transition-colors duration-500"
              :style="{ color: stat === 'mates' ? theme.accentColor : theme.nameColor }"
            >
              {{ formatStatNumber(getStatCount(stat)) }}
            </span>
            <span class="text-[9px] font-bold uppercase tracking-widest transition-colors duration-500" :style="{ color: theme.descColor }">
              {{ stat }}
            </span>
          </button>
        </div>

        <!-- Signature Presentation Panel -->
        <div
          v-if="effectiveCustomization.signaturePath"
          class="w-full mt-6 pt-4 border-t flex flex-col items-center transition-colors duration-500"
          :style="{ borderColor: theme.cardBorderColor }"
        >
          <span
            class="text-[14px] font-bold uppercase tracking-widest mb-1 transition-colors duration-500"
            :style="{ color: theme.descColor }"
          >
            — Signed —
          </span>
          <svg
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
        </div>

      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiAccountPlusOutline, mdiCog, mdiPalette } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileAtmosphere from "@/components/profile/ProfileAtmosphere.vue";
import BackgroundSketch from "@/components/profile/customization/BackgroundSketch.vue";

import {
	calculateSignatureStroke,
	formatStatNumber,
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveTitle,
	type Customization,
} from "@/config/profile_options.config";

const props = withDefaults(
	defineProps<{
		user: any;
		customization?: Partial<Customization>;
		isOwnProfile?: boolean;
		isPreview?: boolean;
	}>(),
	{
		isOwnProfile: false,
		isPreview: false,
	},
);

defineEmits([
	"go-settings",
	"go-customize",
	"go-network",
	"open-connection",
	"add-friend",
	"message",
]);

const doodleZoneRef = ref<HTMLElement | null>(null);

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

const cardStyle = computed(() => ({
	background: theme.value.cardBg,
	borderColor: theme.value.cardBorderColor,
}));

const getStatCount = (key: "mates" | "followers" | "following") =>
	props.user.stats?.[key] || 0;
const signatureStrokeWidth = computed(() =>
	calculateSignatureStroke(effectiveCustomization.value.signatureViewBox),
);
const displayTitle = computed(() =>
	resolveTitle(effectiveCustomization.value.titleId),
);
</script>