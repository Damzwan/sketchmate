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

      <!-- ─── SAVE & SEND DIRECT ──────────────────────────────────────── -->
      <section
        class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all cursor-pointer active:scale-[0.995]"
        :class="{'ring-2 ring-secondary/50': isSaveAndSend}"
        @click="toggleSection('direct')"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none">Save & Send Direct</p>
            <p class="text-sm text-black/60 font-bold mt-1">Keep in gallery and share with mates.</p>
          </div>
          <ion-toggle :checked="isSaveAndSend" color="secondary" @click.stop="toggleSection('direct')"></ion-toggle>
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

      <!-- ─── COMMUNITY POST ─────────────────────────────────────────── -->
      <section
        class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
        :class="[
          {'ring-2 ring-secondary/50': isPublicPost},
          quota.canCreatePost ? 'cursor-pointer active:scale-[0.995]' : 'opacity-60 cursor-not-allowed'
        ]"
        @click="quota.canCreatePost && toggleSection('post')"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none">Community Post</p>
            <p class="text-sm text-black/60 font-bold mt-1">
              <template v-if="quota.canCreatePost">
                Publish to the public feed.
                <span class="text-secondary">{{ quota.posts.remaining }}/{{ quota.posts.limit }} left today.</span>
              </template>
              <template v-else>
                Daily limit reached. Resets in {{ postResetCountdown }}.
              </template>
            </p>
          </div>
          <ion-toggle
            :checked="isPublicPost"
            :disabled="!quota.canCreatePost"
            color="secondary"
            @click.stop="quota.canCreatePost && toggleSection('post')"
          />
        </div>

        <div v-if="isPublicPost" class="pt-4 mt-3 border-t border-primary/20 animate-fade-in space-y-3" @click.stop>
          <textarea
            v-model="postCaption"
            placeholder="Write a caption... (optional)"
            class="w-full bg-primary/10 border border-primary/30 rounded-xl p-3 resize-none outline-none font-bold text-black placeholder:text-black/40 h-20"
            maxlength="200"
          />

          <!-- New post settings -->
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

      <!-- ─── BALLOON ───────────────────────────────────────────────── -->
      <section
        class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
        :class="[
          {'ring-2 ring-secondary/50': isBalloon},
          quota.canSendBalloon ? 'cursor-pointer active:scale-[0.995]' : 'opacity-60 cursor-not-allowed'
        ]"
        @click="quota.canSendBalloon && toggleSection('balloon')"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none"><span class="mr-1">🎈</span> Release Balloon</p>
            <p class="text-sm text-black/60 font-bold mt-1">
              <template v-if="quota.canSendBalloon">
                Send to a random stranger.
                <span class="text-secondary">{{ quota.balloons.remaining }}/{{ quota.balloons.limit }} left today.</span>
              </template>
              <template v-else>
                Daily limit reached. Resets in {{ balloonResetCountdown }}.
              </template>
            </p>
          </div>
          <ion-toggle
            :checked="isBalloon"
            :disabled="!quota.canSendBalloon"
            color="secondary"
            @click.stop="quota.canSendBalloon && toggleSection('balloon')"
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
import { ref, computed, onMounted, onUnmounted } from "vue";
import { IonIcon, IonSpinner, IonToggle, IonButton } from "@ionic/vue";
import { mdiChevronLeft, mdiCheck } from "@mdi/js";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { svg } from "@/helper/general.helper";

import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useDrawStore } from "@/draw/store/draw.store";
import { useMateSelection } from "@/draw/services/useMateSelection";
import { useDrawLoadStore } from "@/draw/store/drawLoad.store";
import { useShareService } from "@/draw/store/useShareService.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useQuotaStore } from "@/store/quota.store";

// @ts-ignore
import PreviewDrawing from "@/components/draw/PreviewDrawing.vue";

const route = useRoute();

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
const { balloons, posts, canSendBalloon, canCreatePost } =
	storeToRefs(quotaStore);

// Compact accessor for the template — avoids having to template-bind 4 refs.
const quota = {
	get balloons() {
		return balloons.value;
	},
	get posts() {
		return posts.value;
	},
	get canSendBalloon() {
		return canSendBalloon.value;
	},
	get canCreatePost() {
		return canCreatePost.value;
	},
};

const { selected, toggle, reset: resetMates } = useMateSelection();

// UI State
const isSaveAndSend = ref(true);
const isPublicPost = ref(false);
const postCaption = ref("");
const postEnableComments = ref(true);
const postEnableRemix = ref(true);
const isBalloon = ref(false);
const balloonNote = ref("");

const isOnline = (id: string) => friendStore.isFriendOnline(id);

const sortedMates = computed(() =>
	[...allConnectedPartners.value].sort((a, b) => {
		const aOnline = isOnline(a._id) ? 1 : 0;
		const bOnline = isOnline(b._id) ? 1 : 0;
		return bOnline - aOnline;
	}),
);

// Countdown ticker (only ticks while at least one section is quota-blocked)
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
	const diff = Math.max(0, new Date(resetIso).getTime() - now.value);
	const h = Math.floor(diff / 3_600_000);
	const m = Math.floor((diff % 3_600_000) / 60_000);
	if (h > 0) return `${h}h ${m}m`;
	const s = Math.floor((diff % 60_000) / 1_000);
	return `${m}m ${s}s`;
}

const balloonResetCountdown = computed(() =>
	fmtCountdown(quota.balloons.reset_at),
);
const postResetCountdown = computed(() => fmtCountdown(quota.posts.reset_at));

onMounted(async () => {
	// Refresh quota on entering the hub — the user may have published from
	// another device since the last fetch.
	void quotaStore.refresh(true);
	ensureTicker();

	setTimeout(
		() => createPreview(),
		drawStore.getCanvas().getObjects().length > 1000 ? 250 : 50,
	);

	// Allow deep-link from the BalloonModal: ?share=balloon
	if (route.query.share === "balloon" && canSendBalloon.value) {
		isBalloon.value = true;
	}
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
	await nav?.popToRoot();
	resetMates();

	const tasks: Array<() => Promise<void>> = [];

	if (directRecipients.length > 0) {
		tasks.push(() => shareService.sendToMates(processedData, directRecipients));
	}

	if (wantsPost) {
		tasks.push(() =>
			shareService.publishCommunityPost(processedData, {
				caption: captionSnapshot,
				enable_comments: enableCommentsSnapshot,
				enable_remix: enableRemixSnapshot,
			}),
		);
	}

	if (wantsBalloon) {
		tasks.push(() =>
			shareService.releaseBalloon(processedData, balloonSnapshot),
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