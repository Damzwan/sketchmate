<template>
  <ion-page class="slide-page">
    <SubPageBar title="Customization" />

    <ion-content class="bg-background">
      <div v-if="user" class="px-4 pt-2 pb-32 max-w-2xl mx-auto cabin-sketch-regular">

        <section class="mb-2 flex justify-center">
          <div class="w-full scale-[0.8] origin-top -mb-14">
            <ProfileCard
              :user="user"
              :customization="draft"
              :is-own-profile="false"
              :is-preview="true"
              :allow-sketch-edit="true"
              @edit-sketch="sketchModalOpen = true"
              @edit-signature="signatureModalOpen = true"
            />
          </div>
        </section>

        <!-- UNIFIED CONFIGURATION GRID -->
        <section class="grid grid-cols-2 gap-3">

          <CustomizeOptionRow
            :icon="mdiCardAccountDetailsOutline"
            label="Identity"
            :value="profileDraft.name"
            @click="identityModalOpen = true"
          >
            <template #preview>
              <img :src="previewImg || user.img" class="w-6 h-6 rounded-md object-cover border border-white" />
            </template>
          </CustomizeOptionRow>

          <CustomizeOptionRow
            :icon="mdiPalette"
            label="Theme"
            :value="currentThemeName"
            @click="themeModalOpen = true"
          >
            <template #preview>
              <div class="flex -space-x-1">
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
              <span class="text-xl font-bold text-black/70 leading-none" :style="{ fontFamily: resolvedFontFamily }">
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
            label="Avatar Decor"
            :value="currentDecorationName"
            @click="decorationModalOpen = true"
          >
            <template #preview>
              <div class="relative w-6 h-6">
                <div class="absolute inset-0 rounded-md border border-white bg-zinc-200 overflow-hidden">
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
              <div class="w-6 h-6 rounded-md bg-gradient-to-br from-zinc-100 to-zinc-200 overflow-hidden relative">
                <ProfileEffect :effect-id="draft.effectId" />
              </div>
            </template>
          </CustomizeOptionRow>

          <CustomizeOptionRow
            :icon="mdiWeatherHurricane"
            label="World"
            :value="currentWorldName"
            @click="worldModalOpen = true"
          >
            <template #preview>
              <div class="w-6 h-6 rounded-md bg-gradient-to-br from-blue-100 to-blue-200 overflow-hidden relative">
                <ProfileWorld :world-id="draft.worldId" :preview="true" :preview-scale="0.085" />
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
            :value="draft.signaturePath ? 'Custom' : 'None'"
            @click="signatureModalOpen = true"
          >
            <template #preview>
              <svg v-if="draft.signaturePath" class="w-8 h-4" :viewBox="draft.signatureViewBox || '0 0 300 150'" preserveAspectRatio="xMidYMid meet">
                <path :d="draft.signaturePath" fill="none" :stroke="currentTheme.accentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </template>
          </CustomizeOptionRow>

          <CustomizeOptionRow
            :icon="mdiBrush"
            label="Card Doodle"
            :value="draft.backgroundSketchPath ? 'Custom doodle' : 'None'"
            @click="sketchModalOpen = true"
          >
            <template #preview>
              <div class="w-8 h-6 rounded overflow-hidden bg-tertiary border border-primary/40 relative">
                <svg v-if="draft.backgroundSketchPath" class="w-full h-full" :viewBox="draft.backgroundSketchViewBox || '0 0 300 360'" preserveAspectRatio="xMidYMid slice">
                  <path :d="draft.backgroundSketchPath" fill="none" :stroke="currentTheme.nameColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.5" />
                </svg>
              </div>
            </template>
          </CustomizeOptionRow>
        </section>

        <!-- SAVE ACTIONS -->
        <transition name="slide-up">
          <div
            v-if="isDirty"
            class="fixed left-0 right-0 bottom-0 p-4 bg-white/90 backdrop-blur-2xl border-t-2 border-secondary/20 flex items-center justify-between z-40 safe-area-bottom"
          >
            <ion-button fill="clear" color="dark" size="large" @click="revert">
              Revert
            </ion-button>
            <ion-button shape="round" color="secondary" size="large" :disabled="isSaving" @click="save">
              {{ isSaving ? 'Saving...' : 'Save' }}
              <ion-icon v-if="!isSaving" :icon="svg(mdiCheck)" slot="end" />
            </ion-button>
          </div>
        </transition>
      </div>
    </ion-content>

    <!-- Modals -->
    <IdentityModal
      :is-open="identityModalOpen"
      :user="user"
      :customization="draft"
      :initial-name="profileDraft.name"
      :initial-desc="profileDraft.description"
      :preview-img="pendingImg"
      @close="identityModalOpen = false"
      @save="handleIdentitySave"
    />

    <ThemeModal :is-open="themeModalOpen" :user="user" :customization="draft" @close="themeModalOpen = false" @select="(id: any) => updateField('themeId', id)" />
    <FontModal :is-open="fontModalOpen" :user="user" :customization="draft" @close="fontModalOpen = false" @select="(id: any) => updateField('fontId', id)" />
    <FontEffectModal :is-open="fontEffectModalOpen" :user="user" :customization="draft" @close="fontEffectModalOpen = false" @select="(id: any) => updateField('fontEffectId', id)" />
    <DecorationModal :is-open="decorationModalOpen" :user="user" :customization="draft" @close="decorationModalOpen = false" @select="(id: any) => updateField('decorationId', id)" />
    <EffectModal :is-open="effectModalOpen" :user="user" :customization="draft" @close="effectModalOpen = false" @select="(id: any) => updateField('effectId', id)" />
    <WorldModal :is-open="worldModalOpen" :user="user" :customization="draft" @close="worldModalOpen = false" @select="(id: any) => updateField('worldId', id)" />
    <TitleModal :is-open="titlesModalOpen" :current-title-id="draft.titleId" @close="titlesModalOpen = false" @select="(id: any) => updateField('titleId', draft.titleId === id ? '' : id)" />
    <SignaturePadModal :is-open="signatureModalOpen" :color="currentTheme.accentColor" @close="signatureModalOpen = false" @save="handleSaveSignature" />
    <BackgroundSketchPadModal :is-open="sketchModalOpen" :color="currentTheme.nameColor" :customization="draft" :user="user" :initial-path="draft.backgroundSketchPath" :initial-view-box="draft.backgroundSketchViewBox" @close="sketchModalOpen = false" @save="handleSaveSketch" />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IonContent, IonPage, IonButton, IonIcon, onIonViewDidEnter } from "@ionic/vue";
import {
	mdiAccountCircleOutline,
	mdiAutoFix,
	mdiBrush,
	mdiCardAccountDetailsOutline,
	mdiCheck,
	mdiDraw,
	mdiFormatColorText,
	mdiFormatFont,
	mdiPalette,
	mdiStarFourPointsOutline,
	mdiWeatherHurricane,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { updateProfile, uploadProfileImg } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";

import SubPageBar from "@/components/general/SubPageBar.vue";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import CustomizeOptionRow from "@/components/profile/customization/CustomizeOptionRow.vue";
import AvatarDecoration from "@/components/profile/customization/AvatarDecoration.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";

// Modal Imports
import IdentityModal from "@/components/profile/customization/IdentityModal.vue";
import ThemeModal from "@/components/profile/customization/ThemeModal.vue";
import FontModal from "@/components/profile/customization/FontModal.vue";
import FontEffectModal from "@/components/profile/customization/FontEffectModal.vue";
import DecorationModal from "@/components/profile/customization/DecorationModal.vue";
import EffectModal from "@/components/profile/customization/EffectModal.vue";
import WorldModal from "@/components/profile/customization/WorldModal.vue";
import TitleModal from "@/components/profile/customization/TitleModal.vue";
import SignaturePadModal from "@/components/profile/customization/SignaturePadModal.vue";
import BackgroundSketchPadModal from "@/components/profile/customization/BackgroundSketchPadModal.vue";

import {
	FONTS,
	FONT_EFFECTS,
	hydrateCustomization,
	resolveDecoration,
	resolveEffect,
	resolveWorld,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveTitle,
	type Customization,
} from "@/config/profile_options.config";

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);
const { toast } = useToast();

onIonViewDidEnter(() => {
	trackEvent(mixpanelEvents.customizationOpen);
});

const isSaving = ref(false);

const identityModalOpen = ref(false);
const themeModalOpen = ref(false);
const fontModalOpen = ref(false);
const fontEffectModalOpen = ref(false);
const decorationModalOpen = ref(false);
const effectModalOpen = ref(false);
const worldModalOpen = ref(false);
const titlesModalOpen = ref(false);
const signatureModalOpen = ref(false);
const sketchModalOpen = ref(false);

const saved = ref<Customization>(
	hydrateCustomization(user.value?.customization),
);
const draft = ref<Customization>(
	hydrateCustomization(user.value?.customization),
);

// Identity Drafts
const profileDraft = ref({
	name: user.value?.name || "",
	description: user.value?.description || "",
});
const savedProfileDraft = ref({
	name: user.value?.name || "",
	description: user.value?.description || "",
});

const pendingImg = ref<string | null>(null);
const previewImg = computed(() => pendingImg.value ?? user.value?.img ?? "");

watch(
	user,
	(val) => {
		if (val) {
			saved.value = hydrateCustomization(val.customization);
			draft.value = hydrateCustomization(val.customization);
			savedProfileDraft.value = {
				name: val.name,
				description: val.description || "",
			};
			profileDraft.value = {
				name: val.name,
				description: val.description || "",
			};
		}
	},
	{ immediate: true },
);

const isDirty = computed(
	() =>
		JSON.stringify(saved.value) !== JSON.stringify(draft.value) ||
		JSON.stringify(savedProfileDraft.value) !==
			JSON.stringify(profileDraft.value) ||
		pendingImg.value !== null,
);

const currentTheme = computed(() => resolveTheme(draft.value.themeId));
const currentThemeName = computed(() => currentTheme.value.name);
const currentDecorationName = computed(
	() => resolveDecoration(draft.value.decorationId).name,
);
const currentEffectName = computed(
	() => resolveEffect(draft.value.effectId).name,
);
const currentWorldName = computed(
	() => resolveWorld(draft.value.worldId).name,
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

const handleIdentitySave = (data: {
	name: string;
	description: string;
	img: string | null;
}) => {
	profileDraft.value.name = data.name;
	profileDraft.value.description = data.description;
	if (data.img) pendingImg.value = data.img;

	// Directly sync preview to User state for instant ProfileCard reflection
	if (user.value) {
		user.value.name = data.name;
		user.value.description = data.description;
	}

	identityModalOpen.value = false;
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
	profileDraft.value = JSON.parse(JSON.stringify(savedProfileDraft.value));
	pendingImg.value = null;
	if (user.value) {
		user.value.name = savedProfileDraft.value.name;
		user.value.description = savedProfileDraft.value.description;
	}
};

const save = async () => {
	if (profileDraft.value.name.trim().length < 4) {
		return toast("Name should be at least 4 characters", { color: "danger" });
	}

	isSaving.value = true;
	try {
		const tasks: Promise<unknown>[] = [];

		tasks.push(
			updateProfile({
				name: profileDraft.value.name.trim(),
				description: profileDraft.value.description.trim(),
				customization: draft.value,
			}),
		);

		if (pendingImg.value) {
			const uploadPromise = fetch(pendingImg.value)
				.then((r) => r.blob())
				.then((blob) => uploadProfileImg(blob, user.value?.img || ""));
			tasks.push(uploadPromise);
		}

		const results = await Promise.all(tasks);

		if (user.value) {
			user.value.customization = JSON.parse(JSON.stringify(draft.value));
			if (profileDraft.value.name.trim() !== savedProfileDraft.value.name)
				user.value.last_name_change = new Date().toISOString();
			user.value.name = profileDraft.value.name.trim();
			user.value.description = profileDraft.value.description.trim();

			if (pendingImg.value && results[1] && (results[1] as any).url) {
				user.value.img = (results[1] as any).url;
			}
		}

		saved.value = JSON.parse(JSON.stringify(draft.value));
		savedProfileDraft.value = JSON.parse(JSON.stringify(profileDraft.value));
		pendingImg.value = null;

		toast("Look and details saved! ✨", { color: "success" });
	} catch (e: any) {
		console.error(e);
		const errorMsg = e?.response?.data?.error || "Failed to save profile";
		toast(errorMsg, { color: "danger" });
	} finally {
		isSaving.value = false;
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