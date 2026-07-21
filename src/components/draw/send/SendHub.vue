<template>
  <div class="h-full bg-background flex flex-col relative top-pad-safe cabin-sketch-regular">

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
          class="inline-flex cursor-pointer hover:scale-105 items-center gap-2 px-4
          py-2 rounded-full bg-white/70 border border-primary/40 shadow-sm text-secondary font-bold active:scale-95 transition-all"
        >
          <ion-icon :icon="svg(mdiShareVariant)" class="text-[20px]" />
          <span class="text-sm pt-0.5">Share to other apps</span>
        </button>
      </div>

      <section
        v-if="!isUnderAge || hasMates"
        class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all cursor-pointer"
        :class="{ 'ring-2 ring-secondary/50': isSaveAndSend }"
        @click="toggleSection('direct')"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <div class="flex items-center gap-2">
              <ion-icon :icon="imagesOutline" class="text-secondary text-[24px] shrink-0" />
              <p class="text-xl font-bold text-black leading-none pt-1">
                {{ hasMates ? 'Gallery & Mates' : 'Save to Gallery' }}
              </p>
            </div>

            <p class="text-sm text-black/80 mt-2 pl-[32px]">
              {{
                hasMates
                  ? 'Save your drawing and send it directly to mates.'
                  : 'Store it in your personal gallery.'
              }}
            </p>
          </div>

          <div
            class="w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 border-secondary"
            :class="isSaveAndSend ? 'bg-secondary scale-105 shadow-sm' : 'bg-secondary/10'"
          >
            <ion-icon
              v-if="isSaveAndSend"
              :icon="svg(mdiCheck)"
              class="text-white w-4 h-4 font-black"
            />
          </div>
        </div>

        <div
          v-if="isSaveAndSend && hasMates"
          class="pt-2 border-t border-primary/20 animate-fade-in"
          @click.stop
        >
          <div class="flex items-center justify-between">
            <p class="text-sm font-black text-black leading-none">
              Share with mates
              <span class="font-bold text-black/50">· up to {{ MAX_SEND_MATES }}</span>
            </p>
            <button
              v-if="selected.size > 0"
              @click.stop="resetMates"
              class="text-sm cursor-pointer font-black uppercase tracking-wider active:opacity-50"
              :class="mateLimitReached ? 'text-amber-600' : 'text-secondary'"
            >
              Clear ({{ selected.size }}/{{ MAX_SEND_MATES }})
            </button>
          </div>

          <!-- Search -->
          <div class="relative mt-2">
            <ion-icon
              :icon="svg(mdiMagnify)"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-base pointer-events-none"
            />
            <input
              v-model="mateSearch"
              @input="onMateSearch"
              type="text"
              placeholder="Search mates..."
              class="w-full bg-primary/10 border border-primary/30 rounded-xl py-2 pl-9 pr-8 text-sm font-bold text-black outline-none placeholder:font-normal placeholder:text-black/70"
            />
            <button
              v-if="mateSearch"
              @click.stop="clearMateSearch"
              class="absolute right-2 cursor-pointer top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-black/10 text-black/70 active:scale-90"
            >
              <ion-icon :icon="svg(mdiClose)" class="text-xs" />
            </button>
          </div>

          <!-- Results strip (horizontal, infinite scroll) -->
          <div
            ref="mateScroll"
            class="flex overflow-x-auto space-x-3 pb-1 hide-scrollbar px-1 mt-2 min-h-[84px] items-center"
          >
            <div
              v-if="networkLoading && matePage === 1"
              class="w-full flex items-center justify-center py-6"
            >
              <ion-spinner name="dots" color="secondary" />
            </div>

            <p
              v-else-if="displayMates.length === 0"
              class="w-full text-center text-xs text-black/70 italic py-6 px-1"
            >
              {{ mateSearch.trim() ? 'No mates match your search.' : 'No mates found.' }}
            </p>

            <template v-else>
              <button
                v-for="mate in displayMates"
                :key="mate._id"
                @click.stop="toggleMate(mate._id)"
                class="relative w-[64px] h-[64px] mt-2 cursor-pointer shrink-0 rounded-2xl border-2 transition-all flex flex-col items-center justify-center"
                :class="
            selected.has(mate._id)
              ? 'border-secondary shadow-md scale-105 bg-secondary/20 hover:scale-105'
              : mateLimitReached
                ? 'border-transparent bg-primary/60 opacity-40'
                : 'border-transparent bg-primary/60 hover:scale-105'
          "
              >
                <div class="relative mb-1">
                  <img
                    :src="mate.img"
                    class="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm"
                  />

                  <div
                    v-if="isOnline(mate._id)"
                    class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-white shadow-sm"
                  />
                </div>

                <div
                  v-if="selected.has(mate._id)"
                  class="absolute -top-1.5 -right-1.5 bg-secondary rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-sm z-10"
                >
                  <ion-icon
                    :icon="svg(mdiCheck)"
                    class="text-white w-4 h-4"
                  />
                </div>

                <span class="text-[11px] font-black truncate w-full text-center px-1 text-black">
            {{ mate.name }}
          </span>
              </button>

              <!-- Infinite-scroll sentinel + spinner -->
              <div ref="mateSentinel" class="shrink-0 w-1 h-1"></div>
              <div v-if="loadingMoreMates" class="flex items-center px-2 shrink-0">
                <ion-spinner name="dots" color="secondary" />
              </div>
            </template>
          </div>
        </div>
      </section>

      <section v-if="isUnderAge && !hasMates"
               class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all cursor-pointer"
               :class="{ 'ring-2 ring-secondary/50': isSaveAndSend }" @click="toggleSection('direct')">
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <div class="flex items-center gap-2">
              <ion-icon :icon="imagesOutline" class="text-secondary text-[24px] shrink-0" />
              <p class="text-xl font-bold text-black leading-none pt-1">Save to Gallery</p>
            </div>
            <p class="text-sm text-black/80 mt-2 pl-[32px]">Keep this drawing in your personal gallery.</p>
          </div>
          <div
            class="w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 border-secondary"
            :class="isSaveAndSend ? 'bg-secondary scale-105 shadow-sm' : 'bg-secondary/10'">
            <ion-icon v-if="isSaveAndSend" :icon="svg(mdiCheck)" class="text-white w-4 h-4 font-black" />
          </div>
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
                  :disabled="shareService.isSending || noActionSelected">
        <span v-if="!shareService.isSending">{{ sendButtonLabel }}</span>
        <ion-spinner v-else name="crescent" class="text-white" />
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
	computed,
	onBeforeUnmount,
	onMounted,
	onUnmounted,
	ref,
	watch,
} from "vue";
import {
	IonButton,
	IonIcon,
	IonSpinner,
	IonToggle,
	useIonRouter,
} from "@ionic/vue";
import { imagesOutline } from "ionicons/icons";
import {
	mdiCheck,
	mdiChevronLeft,
	mdiStar,
	mdiBalloon,
	mdiSprout,
	mdiEarth,
	mdiMagnify,
	mdiClose,
	mdiShareVariant, // Added icon import
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useUserCacheStore } from "@/store/userCache.store";
import {
	MAX_SEND_MATES,
	useMateSelection,
} from "@/draw/services/useMateSelection";
import { useToast } from "@/service/toast.service";
import { useDrawLoadStore } from "@/draw/store/drawLoad.store";
import { useShareService } from "@/draw/store/useShareService.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useQuotaStore } from "@/store/quota.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

// @ts-ignore
import PreviewDrawing from "@/components/draw/PreviewDrawing.vue";
import { useDrawUIStore } from "@/draw/store/drawUI.store";
import { useDrawStore } from "@/draw/store/draw.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import { masterAnimation } from "@/helper/animation.helper";
import { shareImg } from "@/helper/share.helper"; // Added share helper

dayjs.extend(duration);

const router = useIonRouter();

const { user, isUnderAge } = storeToRefs(useAuthStore());
const friendStore = useFriendStore();
const userCache = useUserCacheStore();
const { allConnectedPartners, networkLists, networkLoading, hasMore } =
	storeToRefs(friendStore);

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
const drawUI = useDrawUIStore();

const {
	selected,
	toggle,
	isFull: mateLimitReached,
	reset: resetMates,
} = useMateSelection();
const { toast } = useToast();

// Refusals are silent at the composable level — say why here, once, instead of
// letting the tile look broken.
function toggleMate(id: string) {
	if (!toggle(id)) toast(`You can send to ${MAX_SEND_MATES} mates at a time`);
}

const isBalloon = ref(
	!isUnderAge.value && shareService.preSelected === "balloon",
);
const isSaveAndSend = ref(
	isUnderAge.value || shareService.preSelected !== "balloon",
);

const isPublicPost = ref(false);
const postCaption = ref("");
const postEnableComments = ref(true);
const postEnableRemix = ref(true);
const balloonNote = ref("");

const isOnline = (id: string) => friendStore.isFriendOnline(id);

// ── Searchable / paginated mate picker ──────────────────────────────────────
const mateSearch = ref("");
const matePage = ref(1);
const loadingMoreMates = ref(false);
let mateDebounce: ReturnType<typeof setTimeout> | null = null;

const hasMates = computed(
	() =>
		(user.value?.stats?.mates ?? 0) > 0 ||
		allConnectedPartners.value.length > 0,
);

const fetchedMates = computed(() =>
	networkLists.value.mates.map((entry) => {
		const cached = userCache.getUser(entry._id);
		return {
			...(cached || { _id: entry._id, name: "Artist", img: "" }),
			...entry,
		} as any;
	}),
);

const displayMates = computed(() => {
	const map = new Map<string, any>();
	for (const id of selected.value) {
		const m = friendStore.resolvePartnerInfo(id);
		if (m) map.set(m._id, m);
	}
	for (const m of fetchedMates.value) if (!map.has(m._id)) map.set(m._id, m);

	return [...map.values()].sort((a, b) => {
		const aSel = selected.value.has(a._id) ? 1 : 0;
		const bSel = selected.value.has(b._id) ? 1 : 0;
		if (aSel !== bSel) return bSel - aSel;
		const aOnline = isOnline(a._id) ? 1 : 0;
		const bOnline = isOnline(b._id) ? 1 : 0;
		return bOnline - aOnline;
	});
});

async function fetchMates(reset = false) {
	if (!user.value?._id) return;
	if (reset) matePage.value = 1;
	const term = mateSearch.value.trim();
	if (term.length > 0 && term.length < 3) return;
	try {
		await friendStore.getNetworkList(
			"mates",
			user.value._id,
			matePage.value,
			term,
		);
	} catch (e) {
		console.error("Failed to load mates:", e);
	}
}

function onMateSearch() {
	if (mateDebounce) clearTimeout(mateDebounce);
	if (mateSearch.value.trim().length === 0) {
		fetchMates(true);
		return;
	}
	mateDebounce = setTimeout(() => fetchMates(true), 400);
}

function clearMateSearch() {
	mateSearch.value = "";
	if (mateDebounce) clearTimeout(mateDebounce);
	fetchMates(true);
}

async function loadMoreMates() {
	if (
		!hasMore.value ||
		loadingMoreMates.value ||
		networkLoading.value ||
		(mateSearch.value.trim().length > 0 && mateSearch.value.trim().length < 3)
	)
		return;
	loadingMoreMates.value = true;
	matePage.value++;
	try {
		await fetchMates();
	} finally {
		loadingMoreMates.value = false;
	}
}

const mateScroll = ref<HTMLElement | null>(null);
const mateSentinel = ref<HTMLElement | null>(null);
let mateObserver: IntersectionObserver | null = null;

function attachMateObserver() {
	mateObserver?.disconnect();
	if (!mateSentinel.value) return;
	mateObserver = new IntersectionObserver(
		(entries) => {
			if (entries[0]?.isIntersecting) loadMoreMates();
		},
		{ root: mateScroll.value ?? null, threshold: 0.1 },
	);
	mateObserver.observe(mateSentinel.value);
}

watch(mateSentinel, () => attachMateObserver());

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

const sendButtonLabel = computed(() => {
	if (isUnderAge.value && !hasMates.value) return "Save";
	return "Send";
});

onMounted(async () => {
	drawUI.chatToastsSilenced = true;
	if (isBalloon.value && (!quotaStore.canSendBalloon || isUnderAge.value)) {
		isBalloon.value = false;
		isSaveAndSend.value = true;
	}

	void fetchMates(true);
	attachMateObserver();

	ensureTicker();

	const canvas = drawStore.getCanvas();
	setTimeout(
		() => createPreview(canvas),
		canvas.getObjects().length > 1000 ? 250 : 50,
	);
});

onUnmounted(() => {
	resetPreview();
	drawUI.chatToastsSilenced = false;
});

onBeforeUnmount(() => {
	mateObserver?.disconnect();
	if (mateDebounce) clearTimeout(mateDebounce);
});

const noActionSelected = computed(
	() => !isSaveAndSend.value && !isPublicPost.value && !isBalloon.value,
);

const goBack = (e: Event) => {
	const nav = (e.target as HTMLElement).closest("ion-nav");
	nav?.pop();
};

function toggleSection(section: "direct" | "post" | "balloon") {
	if ((section === "post" || section === "balloon") && isUnderAge.value) return;

	if (section === "direct") isSaveAndSend.value = !isSaveAndSend.value;
	if (section === "post") isPublicPost.value = !isPublicPost.value;
	if (section === "balloon") isBalloon.value = !isBalloon.value;
}

function goToPro() {
	useMenuStore().openMenu(Menu.Shop);
}

function leaveShare() {
	if (useDrawSyncer().isLobby) {
		const nav = document.querySelector("ion-nav");
		void nav?.popToRoot();
		return;
	}

	if (router.canGoBack()) {
		router.back();
		return;
	}
	router.replace(FRONTEND_ROUTES.home, masterAnimation);
}

// ── Native OS Share Method ───────────────────────────────────────────────
async function shareOutsideApp() {
	// Mirror what PreviewDrawing shows: the cropped image when a crop is active,
	// otherwise the full bounding-box preview.
	const img = newPreview.value || preview.value;
	if (!img) return;
	try {
		await shareImg(img, undefined, undefined, "Share drawing");
	} catch (error) {
		console.error("Failed to trigger native share:", error);
	}
}

async function executeShares() {
	if (noActionSelected.value || shareService.isSending) return;

	const directRecipients =
		isSaveAndSend.value && user.value
			? [...Array.from(selected.value), user.value._id]
			: [];

	const wantsPost = isPublicPost.value && !isUnderAge.value;
	const captionSnapshot = postCaption.value;
	const enableCommentsSnapshot = postEnableComments.value;
	const enableRemixSnapshot = postEnableRemix.value;
	const wantsBalloon = isBalloon.value && !isUnderAge.value;
	const balloonSnapshot = balloonNote.value;

	shareService.isSending = true;

	let processedData;
	try {
		processedData = await getDataToSend();
	} catch (error) {
		console.error("Failed to prepare drawing to share:", error);
		shareService.isSending = false;
		return;
	}

	const isLobby = useDrawSyncer().isLobby;
	const loadStore = useDrawLoadStore();
	const sentDraftId = loadStore.currentDraftId;
	if (!isLobby && sentDraftId) loadStore.markDraftRemoved(sentDraftId);

	if (!isLobby) {
		resetCanvas();
	}
	shareService.preSelected = "mate";
	drawUI.isForceExiting = true;
	leaveShare();
	resetMates();

	const runBackgroundShares = async () => {
		try {
			const tasks: Array<() => Promise<void>> = [];

			if (directRecipients.length > 0) {
				tasks.push(() =>
					shareService.sendToMates(processedData, directRecipients),
				);
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
							quotaStore.decrementPost();
						}),
				);
			}

			if (wantsBalloon) {
				tasks.push(() =>
					shareService
						.releaseBalloon(processedData, balloonSnapshot)
						.then(() => {
							quotaStore.decrementBalloon();
						}),
				);
			}

			await shareService.runBatch(tasks);

			if (!isLobby) void loadStore.removeDraft(sentDraftId);
		} catch (error) {
			console.error("Background sharing failed:", error);
		} finally {
			shareService.isSending = false;
		}
	};

	setTimeout(runBackgroundShares, 400);
}
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