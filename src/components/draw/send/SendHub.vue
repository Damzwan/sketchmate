<template>
  <div class="h-full bg-background flex flex-col relative top-pad-safe cabin-sketch-regular">

    <div class="flex items-center px-4 py-2 backdrop-blur-md border-primary/60 z-10">
      <button @click="goBack"
              class="w-10 h-10 flex items-center justify-center bg-white/50 border border-primary/40 rounded-full active:scale-95 transition-transform shadow-sm mr-3">
        <ion-icon :icon="svg(mdiChevronLeft)" class="w-7 h-7 text-black" />
      </button>
      <h2 class="text-2xl cabin-sketch-regular font-bold text-black pt-1">Share</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-4 pb-32">
      <div
        class="bg-primary/20 rounded-3xl p-2 border border-primary/40 shadow-inner max-w-[200px] mx-auto animate-fade-in">
        <PreviewDrawing
          :newPreview="newPreview"
          :src="preview"
          @crop-completed="(e: any) => crop(e)"
          :aspectRatio="getAspectRatio()"
        />
      </div>

      <section
        class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all cursor-pointer"
        :class="{'ring-2 ring-secondary/50': isSaveAndSend}"
        @click="toggleSection('direct')"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none">Save & Send Direct</p>
            <p class="text-sm text-black/60 font-bold mt-1">Keep in gallery and share with mates.</p>
          </div>
          <ion-toggle :checked="isSaveAndSend" color="secondary" class="pointer-events-none"></ion-toggle>
        </div>

        <div v-if="isSaveAndSend && sortedMates.length > 0"
             class="pt-1 mt-1 border-t border-primary/20 animate-fade-in"
             @click.stop>
          <div class="flex overflow-x-auto space-x-3 pb-1 pt-1 hide-scrollbar px-1">
            <button
              v-for="mate in sortedMates"
              :key="mate._id"
              @click.stop="toggle(mate._id)"
              class="relative w-[64px] h-[64px] shrink-0 rounded-2xl border-2 transition-all flex flex-col items-center justify-center"
              :class="selected.has(mate._id) ? 'border-secondary shadow-md scale-105 bg-secondary/20' : 'border-transparent bg-primary/60'"
            >
              <div class="relative mb-1">
                <img :src="mate.img" class="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm" />
                <div v-if="isOnline(mate._id)"
                     class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-white shadow-sm">
                </div>
              </div>

              <div v-if="selected.has(mate._id)"
                   class="absolute -top-1.5 -right-1.5 bg-secondary rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-sm z-10">
                <ion-icon :icon="svg(mdiCheck)" class="text-white w-4 h-4" />
              </div>
              <span class="text-[10px] font-black truncate w-full text-center px-1 text-black">{{ mate.name }}</span>
            </button>
          </div>
        </div>
      </section>

      <section
        class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
        :class="[
          {'ring-2 ring-secondary/50': isPublicPost},
          quotaStore.canCreatePost ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
        ]"
        @click="quotaStore.canCreatePost && toggleSection('post')"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none">Community Post</p>
            <p class="text-sm text-black/60 font-bold mt-1">
              <template v-if="quotaStore.canCreatePost">
                Publish to the public feed.
                <span class="text-secondary">{{ quotaStore.posts.remaining }}/{{ quotaStore.posts.limit }} left today.</span>
              </template>
              <template v-else-if="quotaStore.isPro">
                Daily limit reached. Resets in {{ postResetCountdown }}.
              </template>
              <template v-else>
                Daily limit reached. <span class="text-secondary underline font-black active:scale-95 inline-block cursor-pointer" @click.stop="goToPro">⭐ Upgrade to PRO</span>
              </template>
            </p>
          </div>
          <ion-toggle
            :checked="isPublicPost"
            :disabled="!quotaStore.canCreatePost"
            color="secondary"
            class="pointer-events-none"
          />
        </div>

        <div v-if="isPublicPost" class="pt-4 mt-3 border-t border-primary/20 animate-fade-in space-y-3" @click.stop>
          <textarea
            v-model="postCaption"
            placeholder="Write a caption... (optional)"
            class="w-full bg-primary/10 border border-primary/30 rounded-xl p-3 resize-none outline-none font-bold text-black placeholder:text-black/40 h-20"
            maxlength="200"
          />

          <div class="flex items-center justify-between bg-primary/10 rounded-xl p-3">
            <div class="flex-1 pr-3">
              <p class="text-sm font-black text-black leading-none">Allow comments</p>
              <p class="text-[11px] font-bold text-black/50 mt-1 leading-none">Let viewers leave a note.</p>
            </div>
            <ion-toggle v-model="postEnableComments" color="secondary" />
          </div>

          <div class="flex items-center justify-between bg-primary/10 rounded-xl p-3">
            <div class="flex-1 pr-3">
              <p class="text-sm font-black text-black leading-none">Allow remix</p>
              <p class="text-[11px] font-bold text-black/50 mt-1 leading-none">Anyone can start a session from this drawing.</p>
            </div>
            <ion-toggle v-model="postEnableRemix" color="secondary" />
          </div>
        </div>
      </section>

      <section
        class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
        :class="[
          {'ring-2 ring-secondary/50': isBalloon},
          quotaStore.canSendBalloon ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
        ]"
        @click="quotaStore.canSendBalloon && toggleSection('balloon')"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none"><span class="mr-1">🎈</span> Release Balloon</p>
            <p class="text-sm text-black/60 font-bold mt-1">
              <template v-if="quotaStore.canSendBalloon">
                Send to a random stranger.
                <span class="text-secondary">{{ quotaStore.balloons.remaining }}/{{ quotaStore.balloons.limit }} left today.</span>
              </template>
              <template v-else-if="quotaStore.isPro">
                Daily limit reached. Resets in {{ balloonResetCountdown }}.
              </template>
              <template v-else>
                Daily limit reached. <span class="text-secondary underline font-black active:scale-95 inline-block cursor-pointer" @click.stop="goToPro">⭐ Upgrade to PRO</span>
              </template>
            </p>
          </div>
          <ion-toggle
            :checked="isBalloon"
            :disabled="!quotaStore.canSendBalloon"
            color="secondary"
            class="pointer-events-none"
          />
        </div>

        <div v-if="isBalloon" class="pt-4 mt-3 border-t border-primary/20 animate-fade-in" @click.stop>
          <input
            v-model="balloonNote"
            type="text"
            placeholder="Attach a short note... (optional)"
            maxlength="40"
            class="w-full bg-primary/10 border border-primary/30 rounded-xl p-3 outline-none font-bold text-black placeholder:text-black/40"
          />
        </div>
      </section>
    </div>

    <div class="absolute bottom-6 left-0 right-0 px-6 pointer-events-none z-20">
      <ion-button
        expand="block"
        shape="round"
        color="secondary"
        class="pointer-events-auto h-14 shadow-xl text-2xl"
        @click="executeShares"
        :disabled="shareService.isSending || noActionSelected"
      >
        <span v-if="!shareService.isSending">Send</span>
        <ion-spinner v-else name="crescent" class="text-white" />
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
	IonButton,
	IonIcon,
	IonSpinner,
	IonToggle,
	useIonRouter,
} from "@ionic/vue";
import { mdiCheck, mdiChevronLeft } from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useDrawStore } from "@/draw/store/draw.store";
import { useMateSelection } from "@/draw/services/useMateSelection";
import { useDrawLoadStore } from "@/draw/store/drawLoad.store";
import { useShareService } from "@/draw/store/useShareService.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useQuotaStore } from "@/store/quota.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

// @ts-ignore
import PreviewDrawing from "@/components/draw/PreviewDrawing.vue";

dayjs.extend(duration);

const router = useIonRouter();

const { user } = storeToRefs(useAuthStore());
const friendStore = useFriendStore();
const { allConnectedPartners } = storeToRefs(friendStore);

const drawStore = useDrawStore();
const { preview, newPreview } = storeToRefs(drawStore);
const {
	getDataToSend,
	getAspectRatio,
	crop,
	createPreview,
	resetPreview,
	reset: resetCanvas,
} = drawStore;

const shareService = useShareService();
const quotaStore = useQuotaStore();

const { selected, toggle, reset: resetMates } = useMateSelection();

const isBalloon = ref(shareService.preSelected === "balloon");
const isSaveAndSend = ref(shareService.preSelected !== "balloon");

const isPublicPost = ref(false);
const postCaption = ref("");
const postEnableComments = ref(true);
const postEnableRemix = ref(true);
const balloonNote = ref("");

const isOnline = (id: string) => friendStore.isFriendOnline(id);

const sortedMates = computed(() =>
	[...allConnectedPartners.value].sort((a, b) => {
		const aOnline = isOnline(a._id) ? 1 : 0;
		const bOnline = isOnline(b._id) ? 1 : 0;
		return bOnline - aOnline;
	}),
);

// Ticker to force reactivity updates on the countdown computed properties
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

function ensureTicker() {
	if (timer) return;
	timer = setInterval(() => {
		now.value = Date.now();
	}, 1000);
}

onUnmounted(() => {
	if (timer) clearInterval(timer);
});

function fmtCountdown(resetIso: string): string {
	const diff = dayjs(resetIso).diff(dayjs(now.value));
	if (diff <= 0) return "0m 0s";

	const dur = dayjs.duration(diff);
	const h = Math.floor(dur.asHours());
	const m = dur.minutes();

	return h > 0 ? `${h}h ${m}m` : `${m}m ${dur.seconds()}s`;
}

const balloonResetCountdown = computed(() =>
	fmtCountdown(quotaStore.balloons.reset_at),
);
const postResetCountdown = computed(() =>
	fmtCountdown(quotaStore.posts.reset_at),
);

onMounted(async () => {
	// Graceful fallback: If preSelected was balloon but they actually have no quota left,
	// disable balloon and re-enable direct send so they aren't stuck.
	if (isBalloon.value && !quotaStore.canSendBalloon) {
		isBalloon.value = false;
		isSaveAndSend.value = true;
	}

	ensureTicker();

	const canvas = drawStore.getCanvas();
	setTimeout(
		() => createPreview(canvas),
		canvas.getObjects().length > 1000 ? 250 : 50,
	);
});

onUnmounted(() => resetPreview());

const noActionSelected = computed(
	() => !isSaveAndSend.value && !isPublicPost.value && !isBalloon.value,
);

const goBack = (e: Event) => {
	const nav = (e.target as HTMLElement).closest("ion-nav");
	nav?.pop();
};

function toggleSection(section: "direct" | "post" | "balloon") {
	if (section === "direct") isSaveAndSend.value = !isSaveAndSend.value;
	if (section === "post") isPublicPost.value = !isPublicPost.value;
	if (section === "balloon") isBalloon.value = !isBalloon.value;
}

function goToPro() {
	// router.push({ path: FRONTEND_ROUTES.subscribe });
}

async function executeShares() {
	if (noActionSelected.value) return;

	const processedData = await getDataToSend();

	const directRecipients =
		isSaveAndSend.value && user.value
			? [...Array.from(selected.value), user.value._id]
			: [];
	const wantsPost = isPublicPost.value;
	const captionSnapshot = postCaption.value;
	const enableCommentsSnapshot = postEnableComments.value;
	const enableRemixSnapshot = postEnableRemix.value;
	const wantsBalloon = isBalloon.value;
	const balloonSnapshot = balloonNote.value;

	if (!useDrawSyncer().isLobby) {
		resetCanvas();
	}
	const nav = document.querySelector("ion-nav");
	shareService.preSelected = "mate";
	await nav?.popToRoot();
	resetMates();

	const tasks: Array<() => Promise<void>> = [];

	if (directRecipients.length > 0) {
		tasks.push(() => shareService.sendToMates(processedData, directRecipients));
	}

	if (wantsPost) {
		tasks.push(() =>
			shareService
				.publishCommunityPost(processedData, {
					caption: captionSnapshot,
					enable_comments: enableCommentsSnapshot,
					enable_remix: enableRemixSnapshot,
				})
				.then(() => {
					// Optimistic update
					quotaStore.decrementPost();
				}),
		);
	}

	if (wantsBalloon) {
		tasks.push(() =>
			shareService.releaseBalloon(processedData, balloonSnapshot).then(() => {
				// Optimistic update
				quotaStore.decrementBalloon();
			}),
		);
	}

	await shareService.runBatch(tasks);

	const loadStore = useDrawLoadStore();
	void loadStore.removeDraft();
}
</script>

<style scoped>
.cabin-sketch-regular {
  font-family: 'Cabin Sketch', cursive !important;
}
ion-button {
  --border-radius: 9999px;
  font-family: 'Cabin Sketch', cursive !important;
  font-weight: 700;
}
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-2px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>