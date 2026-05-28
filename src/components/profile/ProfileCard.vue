<template>
  <!-- Outer card: NOT overflow-hidden, so toppers (cat ears) can extend
       above the avatar without being clipped. -->
  <section
    class="rounded-[3rem] border-2 shadow-lg relative px-2 pb-2 pt-4 transition-all duration-500"
    :style="cardStyle"
  >
    <!-- Profile-wide effect at full-card level so particles drift
         across the whole card, not just the doodle zone. -->
    <div class="absolute inset-0 rounded-[3rem] overflow-hidden pointer-events-none z-0">
      <ProfileEffect :effect-id="effectiveCustomization.effectId" />
    </div>

    <div class="relative z-10" :style="{ fontFamily: resolvedFontFamily }">

      <!-- ── TOP LEFT: SETTINGS ── -->
      <div v-if="isOwnProfile && !isPreview" class="absolute top-1 left-0 z-20">
        <transition name="fade">
          <button
            v-if="!isEditing"
            class="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md border border-white/40 shadow-sm transition-all active:scale-95"
            @click="$emit('go-settings')"
          >
            <ion-icon :style="{ color: theme.nameColor }" :icon="svg(mdiCog)" class="text-xl" />
          </button>
        </transition>
      </div>

      <!-- ── TOP RIGHT: CUSTOMIZE & EDIT ── -->
      <div v-if="isOwnProfile && !isPreview" class="absolute top-1 right-0 flex items-center gap-2 z-20">
        <transition name="fade">
          <button
            v-if="!isEditing"
            class="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md border border-white/40 shadow-sm transition-all active:scale-95"
            @click="$emit('go-customize')"
          >
            <ion-icon :style="{ color: theme.nameColor }" :icon="svg(mdiPalette)" class="text-xl" />
          </button>
        </transition>

        <transition name="fade">
          <button
            v-if="isEditing"
            class="w-10 h-10 flex items-center justify-center rounded-full bg-black/10 backdrop-blur-md border border-white/40 shadow-sm transition-all active:scale-95"
            @click="$emit('cancel-edit')"
          >
            <ion-icon :icon="svg(mdiClose)" class="text-xl text-white" />
          </button>
        </transition>

        <button
          class="w-10 h-10 flex items-center justify-center rounded-full shadow-sm transition-all active:scale-95"
          :class="isEditing ? 'bg-green-500 border-none' : 'bg-white/20 backdrop-blur-md border border-white/40'"
          @click="$emit('toggle-edit')"
        >
          <ion-icon
            :style="!isEditing ? { color: theme.nameColor } : { color: '#ffffff' }"
            :icon="svg(isEditing ? mdiCheck : mdiPencil)"
            class="text-xl"
          />
        </button>
      </div>

      <div class="flex flex-col items-center relative mt-2">

        <!-- ─────────────────────────────────────────────────────────
             DOODLE ZONE — fixed-content region (avatar/title/name/bio)
             with vertical padding for drawing breathing room. The
             padding is INSIDE the zone, so strokes drawn in the
             padding still belong to the zone's coordinate space and
             render correctly. Buttons above and content below are
             outside the zone and don't affect sketch geometry.
             ───────────────────────────────────────────────────────── -->
        <div
          ref="doodleZoneRef"
          class="js-doodle-zone relative w-full flex flex-col items-center py-6"
        >
          <!-- Sketch overlay covers the entire padded zone. -->
          <BackgroundSketch
            :path="effectiveCustomization.backgroundSketchPath"
            :view-box="effectiveCustomization.backgroundSketchViewBox"
            :stroke-color="theme.nameColor"
            class="absolute inset-0 z-0"
          />

          <!-- Avatar -->
          <div class="relative z-30 mb-6">
            <UserAvatar
              v-if="!isEditing || !isOwnProfile"
              :user="user"
              :customization="effectiveCustomization"
              size="xl"
            />
            <ProfilePictureSelector
              v-else
              :img="previewImg || user.img"
              :customization="effectiveCustomization"
              @update:img="$emit('update-img', $event)"
            />
          </div>

          <template v-if="!isEditing">
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
          </template>

          <template v-else>
            <div class="w-full mt-6 space-y-4 px-2 relative z-10">
              <div
                class="w-full rounded-[2.5rem] p-5 transition-all duration-300 flex flex-col items-center justify-center relative"
                :class="
                  isNameChangeLocked
                    ? 'bg-black/5 border-2 border-dashed border-black/10'
                    : 'bg-white/70 border-2 border-white shadow-inner'
                "
              >
                <div v-if="isNameChangeLocked" class="flex flex-col items-center text-center">
                  <div class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-secondary mb-2">
                    <ion-icon :icon="svg(mdiClockOutline)" />
                    Wait {{ daysRemaining }} Days
                  </div>
                  <h2 class="text-2xl font-black text-black/20 line-through decoration-secondary/40 decoration-2">
                    {{ user.name }}
                  </h2>
                </div>

                <div v-else class="w-full flex flex-col items-center">
                  <div class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-black/40 mb-2">
                    <ion-icon :icon="svg(mdiAlertCircleOutline)" class="text-secondary" v-if="hasNameChanged" />
                    {{ isPro ? 'Pro: Unlimited Changes' : 'New Identity' }}
                  </div>
                  <ion-input
                    type="text"
                    :counter="true"
                    :value="editForm?.name"
                    placeholder="Artist Name"
                    :minlength="4"
                    :maxlength="20"
                    class="w-full text-center text-2xl font-black text-black"
                    @ionInput="$emit('update:editFormName', ($event.target as HTMLInputElement).value)"
                  />
                  <p
                    v-if="hasNameChanged && !isPro"
                    class="mt-3 text-[12px] font-bold text-secondary uppercase leading-tight text-center"
                  >
                    ⚠️ Careful: Once saved, you can't change <br />
                    this again for 31 days.
                  </p>
                </div>
              </div>

              <div class="w-full bg-white/60 border-2 border-white rounded-[2.5rem] shadow-inner overflow-hidden px-6">
                <ion-textarea
                  :value="editForm?.description"
                  placeholder="Add a short bio or description..."
                  :counter="true"
                  maxlength="80"
                  :auto-grow="true"
                  rows="3"
                  class="font-bold text-black italic text-base"
                  @ionInput="$emit('update:editFormDesc', ($event.target as HTMLTextAreaElement).value)"
                />
              </div>
            </div>
          </template>
        </div>
        <!-- ─── END DOODLE ZONE ─────────────────────────────────── -->

        <!-- Below: CTAs, stats, signature — all outside the doodle zone. -->

        <template v-if="!isEditing">
          <div v-if="!isPreview" class="flex gap-3 w-full mt-6 px-1">
            <ion-button
              v-if="isOwnProfile"
              expand="block"
              shape="round"
              class="w-full m-0 text-sm font-black uppercase tracking-widest shadow-md transition-all duration-500"
              :style="{ '--background': theme.accentColor, '--color': '#ffffff' }"
              @click="$emit('open-connection')"
            >
              <ion-icon slot="start" :icon="svg(mdiAccountPlusOutline)" class="mr-1" />
              Add / Share
            </ion-button>

            <template v-else>
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
            </template>
          </div>
        </template>

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

        <div
          v-if="effectiveCustomization.signaturePath && !isEditing"
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
import dayjs from "dayjs";
import { IonButton, IonIcon, IonInput, IonTextarea } from "@ionic/vue";
import {
	mdiAccountPlusOutline,
	mdiAlertCircleOutline,
	mdiBrush,
	mdiCheck,
	mdiClockOutline,
	mdiClose,
	mdiCog,
	mdiPalette,
	mdiPencil,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import BackgroundSketch from "@/components/profile/customization/BackgroundSketch.vue";
import ProfilePictureSelector from "@/components/account/ProfilePictureSelector.vue";
import { useSubscriptionStore } from "@/store/subscription.store";

import {
	calculateSignatureStroke,
	formatStatNumber,
	hydrateCustomization,
	NAME_CHANGE_COOLDOWN_DAYS,
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
		isEditing?: boolean;
		editForm?: { name: string; description: string };
		isPreview?: boolean;
		allowSketchEdit?: boolean;
		previewImg?: string;
	}>(),
	{
		isOwnProfile: false,
		isEditing: false,
		editForm: () => ({ name: "", description: "" }),
		isPreview: false,
		allowSketchEdit: false,
	},
);

defineEmits([
	"toggle-edit",
	"cancel-edit",
	"go-settings",
	"go-customize",
	"update-img",
	"go-network",
	"open-connection",
	"add-friend",
	"message",
	"update:editFormName",
	"update:editFormDesc",
	"edit-sketch",
]);

const subStore = useSubscriptionStore();
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

const isPro = computed(() => subStore.isPro);
const daysRemaining = computed(() => {
	if (!props.user.last_name_change) return 0;
	const diff =
		NAME_CHANGE_COOLDOWN_DAYS -
		dayjs().diff(dayjs(props.user.last_name_change), "day");
	return diff > 0 ? diff : 0;
});
const isNameChangeLocked = computed(
	() => !isPro.value && daysRemaining.value > 0,
);
const hasNameChanged = computed(
	() => props.editForm.name.trim() !== props.user.name,
);

const getStatCount = (key: "mates" | "followers" | "following") =>
	props.user.stats?.[key] || 0;
const signatureStrokeWidth = computed(() =>
	calculateSignatureStroke(effectiveCustomization.value.signatureViewBox),
);
const displayTitle = computed(() =>
	resolveTitle(effectiveCustomization.value.titleId),
);
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>