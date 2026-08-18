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
<img width="24" height="24" loading="lazy" decoding="async" :src="previewImg || user.img" class="w-6 h-6 rounded-md object-cover border border-white" />
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
<img width="1" height="1" loading="lazy" decoding="async" v-if="user.img" :src="user.img" class="w-full h-full object-cover" alt="" />
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
                <ProfileEffect :effect-id="draft.effectId" static-effect />
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
                <ProfileWorld
                  :world-id="draft.worldId"
                  :preview="true"
                  :preview-scale="0.085"
                  static-mode
                />
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

          <CustomizeOptionRow
            class="col-span-2"
            :icon="mdiChatProcessingOutline"
            label="Chat Style"
            value="Theme, type and chat sketch"
            @click="chatStyleModalOpen = true"
          />
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
    <LazyMount :when="identityModalOpen">
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
    </LazyMount>

    <LazyMount :when="themeModalOpen">
      <ThemeModal :is-open="themeModalOpen" :user="user" :customization="draft" @close="themeModalOpen = false" @select="updateField('themeId', $event)" />
    </LazyMount>
    <LazyMount :when="fontModalOpen">
      <FontModal :is-open="fontModalOpen" :user="user" :customization="draft" @close="fontModalOpen = false" @select="updateField('fontId', $event)" />
    </LazyMount>
    <LazyMount :when="fontEffectModalOpen">
      <FontEffectModal :is-open="fontEffectModalOpen" :user="user" :customization="draft" @close="fontEffectModalOpen = false" @select="updateField('fontEffectId', $event)" />
    </LazyMount>
    <LazyMount :when="decorationModalOpen">
      <DecorationModal :is-open="decorationModalOpen" :user="user" :customization="draft" @close="decorationModalOpen = false" @select="updateField('decorationId', $event)" />
    </LazyMount>
    <LazyMount :when="effectModalOpen">
      <EffectModal :is-open="effectModalOpen" :user="user" :customization="draft" @close="effectModalOpen = false" @select="updateField('effectId', $event)" />
    </LazyMount>
    <LazyMount :when="worldModalOpen">
      <WorldModal :is-open="worldModalOpen" :user="user" :customization="draft" @close="worldModalOpen = false" @select="updateField('worldId', $event)" />
    </LazyMount>
    <LazyMount :when="titlesModalOpen">
      <TitleModal :is-open="titlesModalOpen" :current-title-id="draft.titleId" @close="titlesModalOpen = false" @select="(id: any) => updateField('titleId', draft.titleId === id ? '' : id)" />
    </LazyMount>
    <LazyMount :when="signatureModalOpen">
      <SignaturePadModal :is-open="signatureModalOpen" :color="currentTheme.accentColor" @close="signatureModalOpen = false" @save="handleSaveSignature" />
    </LazyMount>
    <LazyMount :when="sketchModalOpen">
      <BackgroundSketchPadModal :is-open="sketchModalOpen" :color="currentTheme.nameColor" :customization="draft" :user="user" :initial-path="draft.backgroundSketchPath" :initial-view-box="draft.backgroundSketchViewBox" @close="sketchModalOpen = false" @save="handleSaveSketch" />
    </LazyMount>
    <LazyMount :when="chatStyleModalOpen">
      <ChatWidgetCustomizationModal v-model:open="chatStyleModalOpen" />
    </LazyMount>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonIcon, IonPage } from "@ionic/vue";
import {
	mdiAccountCircleOutline,
	mdiAutoFix,
	mdiBrush,
	mdiCardAccountDetailsOutline,
	mdiChatProcessingOutline,
	mdiCheck,
	mdiDraw,
	mdiFormatColorText,
	mdiFormatFont,
	mdiPalette,
	mdiStarFourPointsOutline,
	mdiWeatherHurricane,
} from "@mdi/js";
import { defineAsyncComponent } from "vue";
import LazyMount from "@/components/general/LazyMount.vue";
import SubPageBar from "@/components/general/SubPageBar.vue";
import AvatarDecoration from "@/components/profile/customization/AvatarDecoration.vue";
import CustomizeOptionRow from "@/components/profile/customization/CustomizeOptionRow.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import { useCustomizationPage } from "@/composables/profile/useCustomizationPage";
import { svg } from "@/helper/general.helper";

// Each picker is a separate chunk and is not instantiated until first use.
const IdentityModal = defineAsyncComponent(
	() => import("@/components/profile/customization/IdentityModal.vue"),
);
const ThemeModal = defineAsyncComponent(
	() => import("@/components/profile/customization/ThemeModal.vue"),
);
const FontModal = defineAsyncComponent(
	() => import("@/components/profile/customization/FontModal.vue"),
);
const FontEffectModal = defineAsyncComponent(
	() => import("@/components/profile/customization/FontEffectModal.vue"),
);
const DecorationModal = defineAsyncComponent(
	() => import("@/components/profile/customization/DecorationModal.vue"),
);
const EffectModal = defineAsyncComponent(
	() => import("@/components/profile/customization/EffectModal.vue"),
);
const WorldModal = defineAsyncComponent(
	() => import("@/components/profile/customization/WorldModal.vue"),
);
const TitleModal = defineAsyncComponent(
	() => import("@/components/profile/customization/TitleModal.vue"),
);
const SignaturePadModal = defineAsyncComponent(
	() => import("@/components/profile/customization/SignaturePadModal.vue"),
);
const BackgroundSketchPadModal = defineAsyncComponent(
	() =>
		import("@/components/profile/customization/BackgroundSketchPadModal.vue"),
);
const ChatWidgetCustomizationModal = defineAsyncComponent(
	() => import("@/components/chat/ChatWidgetCustomizationModal.vue"),
);

const {
	user,
	subStore,
	isSaving,
	identityModalOpen,
	themeModalOpen,
	fontModalOpen,
	fontEffectModalOpen,
	decorationModalOpen,
	effectModalOpen,
	worldModalOpen,
	titlesModalOpen,
	signatureModalOpen,
	sketchModalOpen,
	chatStyleModalOpen,
	saved,
	draft,
	profileDraft,
	pendingImg,
	previewImg,
	isDirty,
	currentTheme,
	currentThemeName,
	currentDecorationName,
	currentEffectName,
	currentWorldName,
	currentTitleName,
	currentFontLabel,
	currentFontEffectLabel,
	resolvedFontFamily,
	currentFontEffectClass,
	updateField,
	handleIdentitySave,
	handleSaveSignature,
	handleSaveSketch,
	revert,
	save,
} = useCustomizationPage();
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
