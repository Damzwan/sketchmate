<template>
  <section
    v-if="visible"
    ref="rootEl"
    class="artist-highlights mb-6"
    aria-labelledby="artist-highlights-title"
  >
    <div class="flex items-center justify-between gap-3 px-1 mb-2.5">
      <div class="min-w-0">
        <h3 id="artist-highlights-title" class="text-sm font-black uppercase tracking-widest text-black/65">
          {{ config?.title || "Meet the artists" }}
        </h3>
        <p v-if="config?.subtitle" class="text-xs text-black/55 leading-snug mt-0.5">{{ config.subtitle }}</p>
      </div>
      <button type="button" class="w-9 h-9 shrink-0 flex items-center justify-center opacity-60 cursor-pointer hover:opacity-100 active:scale-90 transition-all" aria-label="Artist highlight options" aria-haspopup="menu" @click="openHideMenu">
        <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-xl text-black/60" />
      </button>
    </div>

    <div v-if="loading" class="h-[390px] rounded-[2rem] bg-tertiary border border-black/5 animate-pulse" aria-busy="true" />

    <swiper-container
      v-else
      ref="artistSwiper"
      class="artist-highlight-swiper"
      :slides-per-view="1.12"
      :space-between="12"
      :pagination="{ clickable: true }"
      :keyboard="{ enabled: true, onlyInViewport: true }"
      :centered-slides="true"
      :centered-slides-bounds="true"
      :slide-to-clicked-slide="true"
      :breakpoints="{ 768: { slidesPerView: 1.18, spaceBetween: 16 } }"
      :grab-cursor="true"
      @swiperslidechange="onArtistSlideChange"
    >
      <swiper-slide v-for="(entry, entryIndex) in config?.artists" :key="entry._id">
        <article
          class="artist-highlight-card relative rounded-[1.75rem] border overflow-hidden shadow-sm"
          :class="entryIndex === activeArtistSlide ? 'artist-highlight-card--active' : 'artist-highlight-card--peek'"
          :style="cardStyle(entry)"
          @click.capture="activateArtistSlide($event, entryIndex)"
        >
          <div v-show="entryIndex === activeArtistSlide" class="absolute inset-0 pointer-events-none z-0">
            <ProfileWorld
              :world-id="customization(entry).worldId"
              :accent="theme(entry).accentColor"
              :font="fontFamily(entry)"
              :dark="theme(entry).isDark"
              feature
              static-mode
              contained
              radius-class="rounded-[1.75rem]"
            />
            <ProfileEffect
              :effect-id="customization(entry).effectId"
              radius-class="rounded-[1.75rem]"
              static-effect
              contained
            />
          </div>

          <div class="relative z-10 pt-3.5 pb-4">
            <div class="artist-identity flex items-center gap-3 px-4 min-h-20" :style="identityStyle(entry)">
              <button type="button" class="shrink-0 rounded-full active:scale-95 transition-transform" :aria-label="`Open ${entry.artist.name}'s profile`" @click="openArtist(entry)">
                <UserAvatar
                  :user="entry.artist"
                  :customization="entry.artist.customization"
                  size="md"
                  static
                />
              </button>

              <div class="min-w-0 flex-1">
                <TitleBadge
                  v-if="customization(entry).titleId"
                  :title-id="customization(entry).titleId"
                  :theme="theme(entry)"
                  extra-class="artist-highlight-title mb-1"
                  @will-open="beginOverlay"
                  @did-close="endOverlay"
                />
                <button type="button" class="flex w-full items-center gap-1.5 text-left active:opacity-70 transition-opacity" @click="openArtist(entry)">
                  <span
                    class="artist-highlight-name block min-w-0 flex-1 text-2xl leading-none font-black truncate"
                    :class="fontClass(entry)"
                    :style="{ fontFamily: fontFamily(entry) }"
                  >{{ entry.artist.name }}</span>
                  <ion-icon :icon="svg(mdiChevronRight)" class="shrink-0 text-xl opacity-60" />
                </button>
              </div>

              <svg
                v-if="customization(entry).signaturePath"
                class="hidden sm:block w-24 h-12 shrink-0 opacity-80"
                :viewBox="customization(entry).signatureViewBox || '0 0 300 150'"
                preserveAspectRatio="xMidYMid meet"
                aria-label="Artist signature"
              >
                <path
                  :d="customization(entry).signaturePath"
                  fill="none"
                  :stroke="theme(entry).accentColor"
                  :stroke-width="signatureStroke(entry)"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            <div class="relative mt-3">
              <div
                :ref="(element) => setArtworkStripRef(entry._id, element as HTMLElement | null)"
                class="swiper-no-swiping artwork-strip flex gap-2.5 overflow-x-auto scroll-smooth snap-x snap-mandatory px-3.5 pb-1"
              >
                <div
                  v-for="(post, postIndex) in entry.posts"
                  :key="post._id"
                  class="relative flex-none w-[82%] sm:w-[64%] h-52 sm:h-60 overflow-hidden rounded-2xl border border-white/60 bg-white/55 shadow-sm snap-center active:scale-[0.98] transition-transform"
                >
                  <button
                    type="button"
                    class="absolute inset-0 w-full h-full cursor-pointer"
                    :aria-label="`Select ${entry.artist.name}'s drawing ${postIndex + 1}`"
                    @click="focusArtwork(entry._id, $event)"
                  >
                    <img :src="post.thumbnail_url || post.image_url" class="absolute inset-0 w-full h-full object-contain" alt="" loading="lazy" decoding="async" fetchpriority="low" />
                  </button>
                  <button
                    type="button"
                    class="absolute top-2 right-2 z-10 h-9 w-9 rounded-full flex items-center justify-center bg-black/40 text-white backdrop-blur-sm border border-white/20 active:scale-90 hover:bg-black/55 transition-all cursor-pointer"
                    :aria-label="`View ${entry.artist.name}'s drawing ${postIndex + 1} fullscreen`"
                    @click.stop="openDrawing(entry.posts, postIndex)"
                  >
                    <ion-icon :icon="svg(mdiArrowExpand)" class="text-lg" />
                  </button>
                  <span class="absolute bottom-2 right-2 pointer-events-none rounded-full bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
                    {{ postIndex + 1 }} / {{ entry.posts.length }}
                  </span>
                </div>
              </div>

              <template v-if="entry.posts.length > 1">
                <button
                  type="button"
                  class="artwork-scroll-button artwork-scroll-button--previous"
                  :aria-label="`Previous artwork by ${entry.artist.name}`"
                  @click="scrollArtwork(entry._id, -1)"
                >
                  <ion-icon :icon="svg(mdiChevronLeft)" />
                </button>
                <button
                  type="button"
                  class="artwork-scroll-button artwork-scroll-button--next"
                  :aria-label="`Next artwork by ${entry.artist.name}`"
                  @click="scrollArtwork(entry._id, 1)"
                >
                  <ion-icon :icon="svg(mdiChevronRight)" />
                </button>
              </template>
            </div>

            <div class="mx-3.5 mt-3 rounded-2xl border backdrop-blur-sm overflow-hidden" :style="scrimStyle(entry)">
              <div
                v-for="(qa, qaIndex) in visibleQuestions(entry)"
                :key="qa._id"
                class="p-3.5"
                :class="qaIndex > 0 ? 'border-t border-current/10' : ''"
              >
                <p class="text-sm font-black leading-snug">{{ qa.question }}</p>
                <p class="text-sm leading-snug mt-1.5 opacity-80 whitespace-pre-wrap">“{{ qa.answer }}”</p>
              </div>

              <button
                v-if="entry.questions.length > 1"
                type="button"
                class="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border-t border-current/10 text-[10px] font-black uppercase tracking-wider active:bg-black/5 cursor-pointer"
                @click="toggleQuestions(entry._id)"
              >
                {{ questionsExpanded(entry._id) ? "Show less" : `${entry.questions.length - 1} more questions` }}
                <ion-icon :icon="svg(questionsExpanded(entry._id) ? mdiChevronUp : mdiChevronDown)" />
              </button>
            </div>

            <div v-if="customization(entry).signaturePath" class="flex justify-end px-5 mt-2.5 opacity-80 sm:hidden">
              <svg class="w-28 h-10" :viewBox="customization(entry).signatureViewBox || '0 0 300 150'" preserveAspectRatio="xMidYMid meet" aria-label="Artist signature">
                <path
                  :d="customization(entry).signaturePath"
                  fill="none"
                  :stroke="theme(entry).accentColor"
                  :stroke-width="signatureStroke(entry)"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
          </div>
        </article>
      </swiper-slide>
    </swiper-container>
  </section>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import {
	mdiArrowExpand,
	mdiChevronDown,
	mdiChevronLeft,
	mdiChevronRight,
	mdiChevronUp,
	mdiDotsHorizontal,
	mdiEyeOffOutline,
	mdiTimerSandComplete,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { register } from "swiper/element/bundle";
import { computed, onMounted, ref, watch } from "vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import TitleBadge from "@/components/profile/TitleBadge.vue";
import { useOverlayScrollGuardContext } from "@/composables/general/useOverlayScrollGuard";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import {
	calculateSignatureStroke,
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
} from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import {
	fetchArtistHighlights,
	updateArtistHighlightPreferences,
} from "@/service/api/artistHighlight.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import type {
	ArtistHighlightConfig,
	ArtistHighlightEntry,
	FeedPost,
} from "@/types/server.types";

register();

const authStore = useAuthStore();
const { user, isLoggedIn } = storeToRefs(authStore);
const { open: photoSwiperOpen } = storeToRefs(usePhotoSwiper());
const { openUserActions } = useUserContextSheet();
const { openPostSwiper } = usePostSwiper();
const { toast } = useToast();
const config = ref<ArtistHighlightConfig | null>(null);
const loading = ref(false);
const loaded = ref(false);
const rootEl = ref<HTMLElement | null>(null);
// The feed owns the guard for this scroller; a second one here would stomp
// its overflowAnchor bookkeeping.
const { captureOverlayScroll, guardScroll, endOverlay, presentActionSheet } =
	useOverlayScrollGuardContext();
const activeArtistSlide = ref(0);
const artistSwiper = ref<any>(null);
const artworkStripRefs = new Map<string, HTMLElement>();
type ArtistPresentation = {
	customization: ReturnType<typeof hydrateCustomization>;
	theme: ReturnType<typeof resolveTheme>;
	palette: ReturnType<typeof resolveReadableCustomizationPalette>;
	fontFamily: string;
	fontClass: string;
};
const presentationCache = new WeakMap<
	ArtistHighlightEntry,
	ArtistPresentation
>();
const expandedQuestionCards = ref<Set<string>>(new Set());
const preferenceEnabled = computed(
	() => user.value?.artist_highlights?.enabled !== false,
);
const snoozed = computed(() => {
	const until = user.value?.artist_highlights?.snoozed_until;
	return !!until && new Date(until).getTime() > Date.now();
});
const eligible = computed(
	() =>
		!!user.value &&
		isLoggedIn.value &&
		preferenceEnabled.value &&
		!snoozed.value,
);
const visible = computed(
	() =>
		eligible.value &&
		(loading.value || (config.value?.artists?.length ?? 0) > 0),
);

async function load() {
	if (loading.value || loaded.value) return;
	loading.value = true;
	try {
		// Home mounts while Capacitor Firebase is still restoring its persisted
		// session. `user` can also change during logout/login, so never ask the
		// authenticated HTTP client for a token until the auth store has finished
		// bootstrap and confirmed this account is logged in.
		const hydratedUser = await authStore.waitUntilInitialized();
		if (!hydratedUser || !authStore.isLoggedIn || !eligible.value) return;

		const requestUserId = hydratedUser._id;
		const response = await fetchArtistHighlights();
		// Do not install viewer-specific reaction data if the account changed
		// while the request was in flight.
		if (user.value?._id !== requestUserId) return;
		config.value = response;
		loaded.value = true;
	} catch (error) {
		if (authStore.isLoggedIn) {
			console.error("[artist highlights] load failed", error);
		}
	} finally {
		loading.value = false;
	}
}

watch(eligible, (canShow) => {
	if (canShow) void load();
});

watch(
	() => user.value?._id,
	(userId, previousUserId) => {
		if (userId === previousUserId) return;
		config.value = null;
		loaded.value = false;
		if (userId) void load();
	},
);
let highlightFullscreenOpen = false;
watch(photoSwiperOpen, (open) => {
	if (open || !highlightFullscreenOpen) return;
	highlightFullscreenOpen = false;
	guardScroll(450, true);
});
onMounted(() => void load());

function presentation(entry: ArtistHighlightEntry): ArtistPresentation {
	const cached = presentationCache.get(entry);
	if (cached) return cached;
	const hydrated = hydrateCustomization(entry.artist.customization);
	const resolvedTheme = resolveTheme(hydrated.themeId);
	const resolved = {
		customization: hydrated,
		theme: resolvedTheme,
		palette: resolveReadableCustomizationPalette(resolvedTheme),
		fontFamily: resolveFontFamily(hydrated.fontId),
		fontClass: resolveFontEffectClass(hydrated.fontEffectId),
	};
	presentationCache.set(entry, resolved);
	return resolved;
}
function customization(entry: ArtistHighlightEntry) {
	return presentation(entry).customization;
}
function theme(entry: ArtistHighlightEntry) {
	return presentation(entry).theme;
}
function palette(entry: ArtistHighlightEntry) {
	return presentation(entry).palette;
}
function fontFamily(entry: ArtistHighlightEntry) {
	return presentation(entry).fontFamily;
}
function fontClass(entry: ArtistHighlightEntry) {
	return presentation(entry).fontClass;
}
function cardStyle(entry: ArtistHighlightEntry) {
	return {
		background: theme(entry).cardBg,
		borderColor: theme(entry).cardBorderColor,
		color: palette(entry).name,
	};
}
function identityStyle(entry: ArtistHighlightEntry) {
	return {
		color: palette(entry).name,
		textShadow: palette(entry).textShadow,
	};
}
function scrimStyle(entry: ArtistHighlightEntry) {
	return {
		background: palette(entry).scrim,
		borderColor: theme(entry).cardBorderColor,
		color: palette(entry).name,
		textShadow: palette(entry).textShadow,
	};
}
function onArtistSlideChange(event: Event) {
	const swiper = (
		event.target as HTMLElement & { swiper?: { activeIndex?: number } }
	).swiper;
	if (typeof swiper?.activeIndex === "number") {
		activeArtistSlide.value = swiper.activeIndex;
	}
}
function activateArtistSlide(event: MouseEvent, entryIndex: number) {
	if (entryIndex === activeArtistSlide.value) return;
	event.preventDefault();
	event.stopPropagation();
	artistSwiper.value?.swiper?.slideTo(entryIndex);
}
function setArtworkStripRef(entryId: string, element: HTMLElement | null) {
	if (element) artworkStripRefs.set(entryId, element);
	else artworkStripRefs.delete(entryId);
}
function scrollArtwork(entryId: string, direction: -1 | 1) {
	const strip = artworkStripRefs.get(entryId);
	if (!strip) return;
	strip.scrollBy({
		left: direction * Math.max(strip.clientWidth * 0.62, 240),
		behavior: "smooth",
	});
}
function focusArtwork(entryId: string, event: MouseEvent) {
	const strip = artworkStripRefs.get(entryId);
	const tile = (event.currentTarget as HTMLElement).parentElement;
	if (!strip || !tile) return;
	strip.scrollTo({
		left: tile.offsetLeft - (strip.clientWidth - tile.clientWidth) / 2,
		behavior: "smooth",
	});
}
function questionsExpanded(entryId: string) {
	return expandedQuestionCards.value.has(entryId);
}
function visibleQuestions(entry: ArtistHighlightEntry) {
	return questionsExpanded(entry._id)
		? entry.questions
		: entry.questions.slice(0, 1);
}
function toggleQuestions(entryId: string) {
	const next = new Set(expandedQuestionCards.value);
	if (next.has(entryId)) next.delete(entryId);
	else next.add(entryId);
	expandedQuestionCards.value = next;
}
function signatureStroke(entry: ArtistHighlightEntry) {
	return calculateSignatureStroke(customization(entry).signatureViewBox);
}

function openArtist(entry: ArtistHighlightEntry) {
	void openUserActions(entry.artist);
}
async function openDrawing(posts: FeedPost[], index: number) {
	await captureOverlayScroll();
	highlightFullscreenOpen = true;
	openPostSwiper(posts, index);
	guardScroll(350);
}

async function beginOverlay() {
	await captureOverlayScroll();
	guardScroll(300);
}

async function setPreference(payload: {
	enabled?: boolean;
	snoozed_until?: string | null;
}) {
	if (!user.value) return;
	const previous = user.value.artist_highlights;
	user.value.artist_highlights = {
		...(previous ?? {}),
		...(payload.enabled === undefined ? {} : { enabled: payload.enabled }),
		...(payload.snoozed_until === undefined
			? {}
			: { snoozed_until: payload.snoozed_until }),
	};
	try {
		await updateArtistHighlightPreferences(payload);
	} catch {
		if (user.value) user.value.artist_highlights = previous;
		toast("Could not update artist highlights", { color: "danger" });
	}
}

// Same shape as the post options sheet: liquid glass surface, a titled header,
// an icon on every non-cancel row, Cancel last. Presented through the shared
// guard so opening it cannot drag the feed back up (see useOverlayScrollGuard).
async function openHideMenu() {
	await presentActionSheet({
		header: "Artist Highlights",
		cssClass: "liquid-action-sheet",
		buttons: [
			{
				text: "Hide For One Week",
				icon: svg(mdiTimerSandComplete),
				handler: () => {
					const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
					void setPreference({ snoozed_until: until.toISOString() });
				},
			},
			{
				text: "Hide Always",
				role: "destructive",
				icon: svg(mdiEyeOffOutline),
				handler: () => void setPreference({ enabled: false }),
			},
			{ text: "Cancel", role: "cancel" },
		],
	});
}
</script>

<style scoped>
.artist-highlight-swiper {
	display: block;
	width: calc(100% + 1rem);
	margin-right: -1rem;
	padding: 0 1rem 2rem 0;
}

/* Same browser-native virtualization strategy as FeedPostCard. `auto` lets the
   browser remember the real rendered height, preventing scroll metrics from
   jumping when this fairly heavy section leaves and re-enters the viewport. */
.artist-highlights {
	content-visibility: auto;
	contain-intrinsic-size: auto 560px;
}

.artist-highlight-card {
	content-visibility: auto;
	contain-intrinsic-size: auto 500px;
	transition: transform 180ms ease, opacity 180ms ease;
}

.artist-highlight-card--peek {
	opacity: 0.72;
	transform: scale(0.965);
	cursor: pointer;
}

.artist-highlight-swiper::part(pagination) {
	bottom: 0;
}

.artist-highlight-swiper::part(bullet-active) {
	background: var(--ion-color-secondary);
}

.artwork-strip {
	scrollbar-width: none;
	-webkit-overflow-scrolling: touch;
}

.artwork-strip::-webkit-scrollbar {
	display: none;
}

.artwork-scroll-button {
	display: none;
}

.artist-identity :deep(.artist-highlight-title) {
	gap: 0.3rem;
	padding: 0.2rem 0.55rem 0.2rem 0.3rem;
	font-size: 0.5rem;
}

.artist-identity :deep(.artist-highlight-title > span:nth-child(2)) {
	width: 0.875rem;
	height: 0.875rem;
	font-size: 0.75rem;
}

/* Profile font/title effects are still represented visually, but an editorial
   feed card must not keep repainting text and sheen layers forever. */
.artist-highlight-name,
.artist-identity :deep(.artist-highlight-title),
.artist-identity :deep(.artist-highlight-title *) {
	animation: none !important;
	will-change: auto !important;
}

@media (min-width: 768px) {
	.artwork-scroll-button {
		position: absolute;
		top: 50%;
		z-index: 20;
		display: flex;
		width: 2.5rem;
		height: 2.5rem;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 9999px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		font-size: 1.35rem;
		cursor: pointer;
		transform: translateY(-50%);
		backdrop-filter: blur(10px);
		transition: transform 150ms ease, background-color 150ms ease;
	}

	.artwork-scroll-button:hover {
		background: rgba(0, 0, 0, 0.82);
		transform: translateY(-50%) scale(1.06);
	}

	.artwork-scroll-button:disabled {
		opacity: 0.22;
		cursor: default;
	}

	.artwork-scroll-button:disabled:hover {
		background: rgba(0, 0, 0, 0.6);
		transform: translateY(-50%);
	}

	.artwork-scroll-button--previous { left: 1.75rem; }
	.artwork-scroll-button--next { right: 1.75rem; }
}
</style>
