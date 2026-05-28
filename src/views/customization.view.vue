<template>
  <ion-page class="slide-page">
    <SubPageBar title="Customization" />

    <ion-content class="bg-background">
      <div v-if="user" class="px-4 pt-6 pb-32 max-w-2xl mx-auto cabin-sketch-regular">

        <!-- Live preview. allow-sketch-edit shows a small FAB in the
             card's top-left corner instead of an overlay on the title. -->
        <section class="mb-8">
          <ProfileCard
            :user="user"
            :customization="draft"
            :is-own-profile="false"
            :is-preview="true"
            :allow-sketch-edit="true"
            @edit-sketch="sketchModalOpen = true"
          />
        </section>

        <!-- Customization rows -->
        <section class="space-y-3">
          <CustomizeOptionRow
            :icon="mdiPalette"
            label="Theme"
            :value="currentThemeName"
            @click="themeModalOpen = true"
          >
            <template #preview>
              <div class="flex gap-1">
                <span
                  v-for="(c, i) in currentTheme.swatches"
                  :key="i"
                  class="w-4 h-4 rounded-full border border-white"
                  :style="{ backgroundColor: c }"
                ></span>
              </div>
            </template>
          </CustomizeOptionRow>

          <CustomizeOptionRow
            :icon="mdiFormatFont"
            label="Font"
            :value="currentFontLabel"
            @click="fontModalOpen = true"
          >
            <template #preview>
              <span
                class="text-2xl font-bold text-black/70 leading-none"
                :style="{ fontFamily: resolvedFontFamily }"
              >
                Aa
              </span>
            </template>
          </CustomizeOptionRow>

          <CustomizeOptionRow
            :icon="mdiFormatColorText"
            label="Text Effect"
            :value="currentFontEffectLabel"
            @click="fontEffectModalOpen = true"
          >
            <template #preview>
              <span
                class="text-xl font-black leading-none"
                :class="currentFontEffectClass"
                :style="{ fontFamily: resolvedFontFamily, color: draft.fontEffectId ? undefined : '#18181b' }"
              >
                Aa
              </span>
            </template>
          </CustomizeOptionRow>

          <CustomizeOptionRow
            :icon="mdiAccountCircleOutline"
            label="Avatar Decoration"
            :value="currentDecorationName"
            @click="decorationModalOpen = true"
          >
            <template #preview>
              <div class="relative w-10 h-10">
                <div class="absolute inset-0 rounded-xl border-2 border-white bg-zinc-200 overflow-hidden">
                  <img v-if="user.img" :src="user.img" class="w-full h-full object-cover" alt="" />
                </div>
                <AvatarDecoration :decoration-id="draft.decorationId" />
              </div>
            </template>
          </CustomizeOptionRow>

          <CustomizeOptionRow
            :icon="mdiAutoFix"
            label="Profile Effect"
            :value="currentEffectName"
            @click="effectModalOpen = true"
          >
            <template #preview>
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 overflow-hidden relative">
                <ProfileEffect :effect-id="draft.effectId" />
              </div>
            </template>
          </CustomizeOptionRow>

          <CustomizeOptionRow
            :icon="mdiStarFourPointsOutline"
            label="Title"
            :value="currentTitleName || 'No title'"
            @click="titlesModalOpen = true"
          />

          <CustomizeOptionRow
            :icon="mdiDraw"
            label="Signature"
            :value="draft.signaturePath ? 'Custom signature' : 'None'"
            @click="signatureModalOpen = true"
          >
            <template #preview>
              <svg
                v-if="draft.signaturePath"
                class="w-12 h-8"
                :viewBox="draft.signatureViewBox || '0 0 300 150'"
                preserveAspectRatio="xMidYMid meet"
              >
                <path
                  :d="draft.signaturePath"
                  fill="none"
                  :stroke="currentTheme.accentColor"
                  stroke-width="8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </template>
          </CustomizeOptionRow>

          <!-- Card doodle row — mirrors signature row layout. -->
          <CustomizeOptionRow
            :icon="mdiBrush"
            label="Card Doodle"
            :value="draft.backgroundSketchPath ? 'Custom doodle' : 'None'"
            @click="sketchModalOpen = true"
          >
            <template #preview>
              <div class="w-12 h-8 rounded-lg overflow-hidden bg-white/40 border border-white relative">
                <svg
                  v-if="draft.backgroundSketchPath"
                  class="w-full h-full"
                  :viewBox="draft.backgroundSketchViewBox || '0 0 300 360'"
                  preserveAspectRatio="xMidYMid slice"
                >
                  <path
                    :d="draft.backgroundSketchPath"
                    fill="none"
                    :stroke="currentTheme.nameColor"
                    stroke-width="6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    opacity="0.5"
                  />
                </svg>
              </div>
            </template>
          </CustomizeOptionRow>

          <!-- Clear button only when a doodle exists. Keeps the row clean. -->
          <button
            v-if="draft.backgroundSketchPath"
            class="w-full text-[11px] font-black uppercase tracking-widest text-secondary/70 active:text-secondary py-1"
            @click="clearSketch"
          >
            Clear card doodle
          </button>
        </section>

        <!-- Sticky save/revert footer -->
        <transition name="slide-up">
          <div
            v-if="isDirty"
            class="fixed left-0 right-0 bottom-0 p-4 bg-white/90 backdrop-blur-2xl border-t-2 border-secondary/20 flex items-center justify-between z-40 safe-area-bottom"
          >
            <ion-button fill="clear" color="dark" class="font-black tracking-widest text-xs mb-4" @click="revert">
              Revert
            </ion-button>
            <ion-button shape="round" color="secondary" class="mb-4" @click="save">
              Save Look ✓
            </ion-button>
          </div>
        </transition>
      </div>
    </ion-content>

    <!-- Modals -->
    <ThemeModal
      :is-open="themeModalOpen"
      :user="user"
      :customization="draft"
      @close="themeModalOpen = false"
      @select="(id: any) => updateField('themeId', id)"
    />

    <FontModal
      :is-open="fontModalOpen"
      :user="user"
      :customization="draft"
      @close="fontModalOpen = false"
      @select="(id: any) => updateField('fontId', id)"
    />

    <FontEffectModal
      :is-open="fontEffectModalOpen"
      :user="user"
      :customization="draft"
      @close="fontEffectModalOpen = false"
      @select="(id: any) => updateField('fontEffectId', id)"
    />

    <DecorationModal
      :is-open="decorationModalOpen"
      :user="user"
      :customization="draft"
      @close="decorationModalOpen = false"
      @select="(id: any) => updateField('decorationId', id)"
    />

    <EffectModal
      :is-open="effectModalOpen"
      :user="user"
      :customization="draft"
      @close="effectModalOpen = false"
      @select="(id: any) => updateField('effectId', id)"
    />

    <TitleModal
      :is-open="titlesModalOpen"
      :current-title-id="draft.titleId"
      @close="titlesModalOpen = false"
      @select="(id: any) => updateField('titleId', draft.titleId === id ? '' : id)"
    />

    <SignaturePadModal
      :is-open="signatureModalOpen"
      :color="currentTheme.accentColor"
      @close="signatureModalOpen = false"
      @save="handleSaveSignature"
    />

    <!-- Sketch pad gets the live draft + user so it can render the actual
         card as the drawing surface. Stroke color = theme.nameColor to
         match what BackgroundSketch.vue renders on the card. -->
    <BackgroundSketchPadModal
      :is-open="sketchModalOpen"
      :color="currentTheme.nameColor"
      :customization="draft"
      :user="user"
      :initial-path="draft.backgroundSketchPath"
      :initial-view-box="draft.backgroundSketchViewBox"
      @close="sketchModalOpen = false"
      @save="handleSaveSketch"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IonContent, IonPage, IonButton } from "@ionic/vue";
import {
	mdiAccountCircleOutline,
	mdiAutoFix,
	mdiBrush,
	mdiDraw,
	mdiFormatColorText,
	mdiFormatFont,
	mdiPalette,
	mdiStarFourPointsOutline,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { updateProfile } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";

import ProfileCard from "@/components/profile/ProfileCard.vue";
import AvatarDecoration from "@/components/profile/customization/AvatarDecoration.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ThemeModal from "@/components/profile/customization/ThemeModal.vue";
import FontModal from "@/components/profile/customization/FontModal.vue";
import FontEffectModal from "@/components/profile/customization/FontEffectModal.vue";
import DecorationModal from "@/components/profile/customization/DecorationModal.vue";
import TitleModal from "@/components/profile/customization/TitleModal.vue";
import SignaturePadModal from "@/components/profile/customization/SignaturePadModal.vue";
import BackgroundSketchPadModal from "@/components/profile/customization/BackgroundSketchPadModal.vue";
import CustomizeOptionRow from "@/components/profile/customization/CustomizeOptionRow.vue";

import {
	FONTS,
	FONT_EFFECTS,
	hydrateCustomization,
	resolveDecoration,
	resolveEffect,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveTitle,
	type Customization,
} from "@/config/profile_options.config";
import SubPageBar from "@/components/general/SubPageBar.vue";
import EffectModal from "@/components/profile/customization/EffectModal.vue";

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);
const { toast } = useToast();

const themeModalOpen = ref(false);
const fontModalOpen = ref(false);
const fontEffectModalOpen = ref(false);
const decorationModalOpen = ref(false);
const effectModalOpen = ref(false);
const titlesModalOpen = ref(false);
const signatureModalOpen = ref(false);
const sketchModalOpen = ref(false);

const saved = ref<Customization>(
	hydrateCustomization(user.value?.customization),
);
const draft = ref<Customization>(
	hydrateCustomization(user.value?.customization),
);

watch(
	user,
	(val) => {
		if (val) {
			saved.value = hydrateCustomization(val.customization);
			draft.value = hydrateCustomization(val.customization);
		}
	},
	{ immediate: true },
);

const isDirty = computed(
	() => JSON.stringify(saved.value) !== JSON.stringify(draft.value),
);

const currentTheme = computed(() => resolveTheme(draft.value.themeId));
const currentThemeName = computed(() => currentTheme.value.name);
const currentDecorationName = computed(
	() => resolveDecoration(draft.value.decorationId).name,
);
const currentEffectName = computed(
	() => resolveEffect(draft.value.effectId).name,
);
const currentTitleName = computed(() => resolveTitle(draft.value.titleId));

const currentFontLabel = computed(
	() => FONTS.find((f) => f.value === draft.value.fontId)?.label || "Sketch",
);
const currentFontEffectLabel = computed(
	() =>
		FONT_EFFECTS.find((e) => e.value === draft.value.fontEffectId)?.label ||
		"None",
);
const resolvedFontFamily = computed(() =>
	resolveFontFamily(draft.value.fontId),
);
const currentFontEffectClass = computed(() =>
	resolveFontEffectClass(draft.value.fontEffectId),
);

const updateField = <K extends keyof Customization>(
	field: K,
	value: Customization[K],
) => {
	draft.value = { ...draft.value, [field]: value };
};

const handleSaveSignature = (sigData: { path: string; viewBox: string }) => {
	draft.value = {
		...draft.value,
		signaturePath: sigData.path,
		signatureViewBox: sigData.viewBox,
	};
	signatureModalOpen.value = false;
};

const handleSaveSketch = (data: { path: string; viewBox: string }) => {
	draft.value = {
		...draft.value,
		backgroundSketchPath: data.path,
		backgroundSketchViewBox: data.viewBox,
	};
	sketchModalOpen.value = false;
};

const clearSketch = () => {
	draft.value = {
		...draft.value,
		backgroundSketchPath: "",
		backgroundSketchViewBox: "",
	};
};

const revert = () => {
	draft.value = JSON.parse(JSON.stringify(saved.value));
};

const save = async () => {
	try {
		await updateProfile({ customization: draft.value });
		saved.value = JSON.parse(JSON.stringify(draft.value));
		if (user.value) {
			user.value.customization = JSON.parse(JSON.stringify(draft.value));
		}
		toast("Look saved! ✨", { color: "success" });
	} catch (e) {
		console.error(e);
		toast("Failed to save", { color: "danger" });
	}
};
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>