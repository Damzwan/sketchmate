<template>
  <!-- Body copy here is the UI face; the display face is opted into on the
       heading only (see fonts.css — a wrapper-level opt-in smears every small
       label under it on mobile WebViews). -->
  <div class="h-full bg-background flex flex-col relative top-pad-safe">

    <div class="flex items-center px-4 py-2 backdrop-blur-md border-primary/60 z-10">
      <ion-button fill="clear" @click="goBack" class="m-0 p-0 text-black">
        <ion-icon :icon="svg(mdiChevronLeft)" class="w-8 h-8" />
      </ion-button>
      <h2 class="text-2xl cabin-sketch-regular font-bold text-black pt-1">Share</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-4 pb-32">
      <div
        class="bg-primary/20 rounded-3xl p-2 border border-primary/40 shadow-inner max-w-[200px] mx-auto animate-fade-in">
        <PreviewDrawing :newPreview="newPreview" :src="preview" @crop-completed="(e: any) => crop(e)"
                        :aspectRatio="getAspectRatio()" />
      </div>

      <!-- External share sits with the drawing, apart from the in-app share
           cards below (those all fire together via Send). This is an instant,
           standalone export to the device's own share sheet. -->
      <div class="flex justify-center -mt-1">
        <button
          @click="shareOutsideApp"
          :disabled="isPreparing"
          class="inline-flex cursor-pointer hover:scale-105 items-center gap-2 px-4
          py-2 rounded-full bg-white/70 border border-primary/40 shadow-sm text-secondary font-bold active:scale-95 transition-all
          disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <ion-spinner v-if="isPreparing" name="crescent" class="w-5 h-5" />
          <ion-icon v-else :icon="svg(mdiShareVariant)" class="text-[20px]" />
          <span class="text-sm pt-0.5">{{ isPreparing ? 'Preparing…' : 'Share to other apps' }}</span>
        </button>
      </div>

      <SendMateSection
        v-model="isSaveAndSend"
        :is-under-age="isUnderAge"
        :picker="matePicker"
        @toggle="toggleSection('direct')"
      />

      <!-- WEEKLY COMPETITION — absent entirely in a week with nothing open, so
           the sheet is unchanged in the normal case. Accent comes from the
           competition itself, so this visibly matches the home card the user
           tapped to get here. -->
      <section
        v-if="showCompetition"
        class="border rounded-2xl p-3 shadow-sm transition-all"
        :style="competitionSectionStyle"
        :class="[
          { 'ring-2': isCompetition },
          competitionDisabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer md:hover:scale-[1.01]'
        ]"
        @click="!competitionDisabled && toggleSection('competition')"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-3 min-w-0">
            <div class="flex items-center gap-2">
              <ion-icon :icon="svg(mdiTrophyOutline)" class="text-[20px] shrink-0" :style="{ color: competitionAccent.ink }" />
              <p class="text-base font-black text-black leading-none truncate">Weekly Competition</p>
            </div>

            <div class="text-xs text-black/75 mt-1 pl-[28px] flex gap-1 min-w-0">
              <span class="font-black truncate">{{ competitionStore.competition?.theme }}</span>
              <span class="shrink-0" :style="{ color: competitionAccent.ink }">
                · {{ competitionStore.hasEntered ? 'Already entered' : `${competitionCountdown} left` }}
              </span>
            </div>
          </div>

          <div
            class="w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0"
            :style="{ borderColor: competitionAccent.ink, background: isCompetition ? competitionAccent.ink : 'transparent' }"
          >
            <ion-icon v-if="isCompetition" :icon="svg(mdiCheck)" class="text-white w-4 h-4 font-black" />
          </div>
        </div>

        <div v-if="isCompetition" class="pt-4 mt-3 border-t border-black/10 animate-fade-in" @click.stop>
          <textarea v-model="competitionCaption" placeholder="Say something about it... (optional)"
                    class="w-full bg-black/5 border border-black/10 rounded-xl p-3 resize-none outline-none font-bold text-black placeholder:font-normal placeholder:text-black/70 h-20"
                    maxlength="100" />
        </div>
      </section>

      <section v-if="!isUnderAge" class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
               :class="[
          { 'ring-2 ring-secondary/50': isPublicPost },
          quotaStore.canCreatePost ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
        ]" @click="quotaStore.canCreatePost && toggleSection('post')">
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <div class="flex items-center gap-2">
              <ion-icon :icon="svg(mdiEarth)" class="text-secondary text-[24px] shrink-0" />
              <p class="text-xl font-bold text-black leading-none pt-1">Community Post</p>
            </div>

            <div class="text-sm text-black/80 mt-2 pl-[32px]">
              <template v-if="quotaStore.canCreatePost">
                <div>Publish to the public feed.</div>
                <div class="text-secondary mt-1">{{ quotaStore.posts.remaining }}/{{ quotaStore.posts.limit }} left
                  today.
                </div>
              </template>
              <template v-else-if="quotaStore.isPro">
                Daily limit reached. Resets in {{ postResetCountdown }}.
              </template>
              <template v-else>
                Daily limit reached. <span
                class="text-secondary underline font-black active:scale-95 inline-block cursor-pointer"
                @click.stop="goToPro"><ion-icon :icon="svg(mdiStar)"
                                                class="text-xs align-[-1px]" /> Upgrade to PRO</span>
              </template>
            </div>
          </div>
          <div
            class="w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 border-secondary"
            :class="[
              isPublicPost ? 'bg-secondary scale-105 shadow-sm' : 'bg-secondary/10',
              !quotaStore.canCreatePost ? 'opacity-50' : ''
            ]">
            <ion-icon v-if="isPublicPost" :icon="svg(mdiCheck)" class="text-white w-4 h-4 font-black" />
          </div>
        </div>

        <div v-if="isPublicPost" class="pt-4 mt-3 border-t border-primary/20 animate-fade-in space-y-3" @click.stop>
          <textarea v-model="postCaption" placeholder="Write a caption... (optional)"
                    class="w-full bg-primary/10 border border-primary/30 rounded-xl p-3 resize-none outline-none font-bold text-black placeholder:font-normal placeholder:text-black/70 h-20"
                    maxlength="100" />

          <div class="flex items-center justify-between bg-primary/10 rounded-xl p-3">
            <div class="flex-1 pr-3">
              <p class="text-sm font-black text-black leading-none">Allow comments</p>
              <p class="text-xs text-black/80 mt-1 leading-none">Let viewers leave a note.</p>
            </div>
            <ion-toggle v-model="postEnableComments" color="secondary" />
          </div>

          <div class="flex items-center justify-between bg-primary/10 rounded-xl p-3">
            <div class="flex-1 pr-3">
              <p class="text-sm font-black text-black leading-none">Allow remix</p>
              <p class="text-xs text-black/80 mt-1 leading-none">Anyone can start a session from this
                drawing.</p>
            </div>
            <ion-toggle v-model="postEnableRemix" color="secondary" />
          </div>
        </div>
      </section>

      <section v-if="!isUnderAge" class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
               :class="[
          { 'ring-2 ring-secondary/50': isBalloon },
          quotaStore.canSendBalloon ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
        ]" @click="quotaStore.canSendBalloon && toggleSection('balloon')">
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <div class="flex items-center gap-2">
              <ion-icon :icon="svg(mdiBalloon)" class="text-secondary text-[24px] shrink-0" />
              <p class="text-xl font-bold text-black leading-none pt-1">Release Balloon</p>
            </div>
            <div class="text-sm text-black/80 mt-2 pl-[32px]">
              <template v-if="quotaStore.canSendBalloon">
                <div>Send to a stranger.</div>
                <div class="text-secondary mt-1">{{ quotaStore.balloons.remaining }}/{{ quotaStore.balloons.limit }}
                  left today.
                </div>
              </template>
              <template v-else-if="quotaStore.isPro">
                Daily limit reached. Resets in {{ balloonResetCountdown }}.
              </template>
              <template v-else>
                Daily limit reached. <span
                class="text-secondary underline font-black active:scale-95 inline-block cursor-pointer"
                @click.stop="goToPro"><ion-icon :icon="svg(mdiStar)"
                                                class="text-xs align-[-1px]" /> Upgrade to PRO</span>
              </template>
            </div>
          </div>
          <div
            class="w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 border-secondary"
            :class="[
              isBalloon ? 'bg-secondary scale-105 shadow-sm' : 'bg-secondary/10',
              !quotaStore.canSendBalloon ? 'opacity-50' : ''
            ]">
            <ion-icon v-if="isBalloon" :icon="svg(mdiCheck)" class="text-white w-4 h-4 font-black" />
          </div>
        </div>

        <div v-if="isBalloon" class="pt-4 mt-3 border-t border-primary/20 animate-fade-in" @click.stop>
          <input v-model="balloonNote" type="text" placeholder="Attach a short note... (optional)" maxlength="40"
                 class="w-full bg-primary/10 border border-primary/30 rounded-xl p-3 outline-none font-bold text-black placeholder:font-normal placeholder:text-black/70" />
        </div>
      </section>

      <section v-if="isUnderAge" class="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex gap-3">
        <ion-icon :icon="svg(mdiSprout)" class="text-2xl shrink-0 text-amber-600" />
        <div class="flex-1 min-w-0">
          <p class="font-black text-base text-amber-900 leading-tight">
            More sharing options unlock at 13
          </p>
          <p class="text-sm text-amber-900/90 mt-1 leading-snug">
            Community posts and balloons will turn on when you're old enough. For now, you can save your work and send
            to
            mates.
          </p>
        </div>
      </section>
    </div>

    <div class="absolute bottom-6 left-0 right-0 px-6 z-20">
      <ion-button expand="block" shape="round" color="secondary" size="large" @click="executeShares"
                  :disabled="shareService.isSending || isPreparing || noActionSelected">
        <span v-if="!shareService.isSending && !isPreparing">{{ sendButtonLabel }}</span>
        <span v-else class="flex items-center gap-2">
          <ion-spinner name="crescent" class="text-white" />
          <span v-if="isPreparing" class="pt-0.5">Preparing…</span>
        </span>
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonSpinner, IonToggle } from "@ionic/vue";
import {
	mdiBalloon,
	mdiCheck,
	mdiChevronLeft,
	mdiEarth,
	mdiShareVariant,
	mdiSprout,
	mdiStar,
	mdiTrophyOutline,
} from "@mdi/js";
import PreviewDrawing from "@/components/draw/PreviewDrawing.vue";
import { svg } from "@/helper/general.helper";
import SendMateSection from "./SendMateSection.vue";
import { useSendHub } from "./useSendHub";

const {
	preview,
	newPreview,
	getAspectRatio,
	crop,
	isUnderAge,
	shareService,
	quotaStore,
	competitionStore,
	matePicker,
	isSaveAndSend,
	isBalloon,
	isCompetition,
	isPublicPost,
	competitionCaption,
	postCaption,
	postEnableComments,
	postEnableRemix,
	balloonNote,
	showCompetition,
	competitionDisabled,
	competitionAccent,
	competitionSectionStyle,
	competitionCountdown,
	balloonResetCountdown,
	postResetCountdown,
	sendButtonLabel,
	noActionSelected,
	isPreparing,
	goBack,
	toggleSection,
	goToPro,
	shareOutsideApp,
	executeShares,
} = useSendHub();
</script>

<style scoped>
ion-button {
  --border-radius: 9999px;
  font-weight: 700;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
