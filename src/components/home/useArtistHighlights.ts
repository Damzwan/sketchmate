import { mdiEyeOffOutline, mdiTimerSandComplete } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
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

type Presentation = {
	customization: ReturnType<typeof hydrateCustomization>;
	theme: ReturnType<typeof resolveTheme>;
	palette: ReturnType<typeof resolveReadableCustomizationPalette>;
	fontFamily: string;
	fontClass: string;
};

/**
 * The FETCHED highlight set, hoisted to module scope.
 *
 * The component now lives inside the feed's tab-keyed stream, so switching tabs
 * unmounts and remounts it. With this state per-instance, `loaded` reset on
 * every remount and `onMounted` fired a fresh HTTP request each time — one
 * network round-trip per tab tap, for a payload that does not change.
 *
 * Only the data is shared. Everything below (slide index, swiper handle, strip
 * refs, expanded questions) is genuine per-instance view state and stays inside
 * the composable.
 */
const config = ref<ArtistHighlightConfig | null>(null);
const loading = ref(false);
const loaded = ref(false);

export function useArtistHighlights() {
	const auth = useAuthStore();
	const { user, isLoggedIn } = storeToRefs(auth);
	const { open: photoSwiperOpen } = storeToRefs(usePhotoSwiper());
	const { openUserActions } = useUserContextSheet();
	const { openPostSwiper } = usePostSwiper();
	const { toast } = useToast();
	const { captureOverlayScroll, guardScroll, endOverlay, presentActionSheet } =
		useOverlayScrollGuardContext();
	const activeArtistSlide = ref(0);
	const artistSwiper = ref<any>(null);
	const artworkStrips = new Map<string, HTMLElement>();
	const presentationCache = new WeakMap<ArtistHighlightEntry, Presentation>();
	const expandedQuestions = ref(new Set<string>());
	let fullscreenOpen = false;

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
			const currentUser = await auth.waitUntilInitialized();
			if (!currentUser || !auth.isLoggedIn || !eligible.value) return;
			const response = await fetchArtistHighlights();
			if (user.value?._id !== currentUser._id) return;
			config.value = response;
			loaded.value = true;
		} catch (error) {
			if (auth.isLoggedIn)
				console.error("[artist highlights] load failed", error);
		} finally {
			loading.value = false;
		}
	}

	watch(eligible, (canShow) => canShow && void load());
	watch(
		() => user.value?._id,
		(userId, previousId) => {
			if (userId === previousId) return;
			config.value = null;
			loaded.value = false;
			if (userId) void load();
		},
	);
	watch(photoSwiperOpen, (open) => {
		if (open || !fullscreenOpen) return;
		fullscreenOpen = false;
		guardScroll(450, true);
	});
	onMounted(() => void load());

	function presentation(entry: ArtistHighlightEntry) {
		const cached = presentationCache.get(entry);
		if (cached) return cached;
		const customization = hydrateCustomization(entry.artist.customization);
		const theme = resolveTheme(customization.themeId);
		const result = {
			customization,
			theme,
			palette: resolveReadableCustomizationPalette(theme),
			fontFamily: resolveFontFamily(customization.fontId),
			fontClass: resolveFontEffectClass(customization.fontEffectId),
		};
		presentationCache.set(entry, result);
		return result;
	}
	const customization = (entry: ArtistHighlightEntry) =>
		presentation(entry).customization;
	const theme = (entry: ArtistHighlightEntry) => presentation(entry).theme;
	const palette = (entry: ArtistHighlightEntry) => presentation(entry).palette;
	const fontFamily = (entry: ArtistHighlightEntry) =>
		presentation(entry).fontFamily;
	const fontClass = (entry: ArtistHighlightEntry) =>
		presentation(entry).fontClass;
	const cardStyle = (entry: ArtistHighlightEntry) => ({
		background: theme(entry).cardBg,
		borderColor: theme(entry).cardBorderColor,
		color: palette(entry).name,
	});
	const identityStyle = (entry: ArtistHighlightEntry) => ({
		color: palette(entry).name,
		textShadow: palette(entry).textShadow,
	});
	const scrimStyle = (entry: ArtistHighlightEntry) => ({
		background: palette(entry).scrim,
		borderColor: theme(entry).cardBorderColor,
		color: palette(entry).name,
		textShadow: palette(entry).textShadow,
	});

	function onArtistSlideChange(event: Event) {
		const swiper = (
			event.target as HTMLElement & {
				swiper?: { activeIndex?: number };
			}
		).swiper;
		if (typeof swiper?.activeIndex === "number") {
			activeArtistSlide.value = swiper.activeIndex;
		}
	}
	function activateArtistSlide(event: MouseEvent, index: number) {
		if (index === activeArtistSlide.value) return;
		event.preventDefault();
		event.stopPropagation();
		artistSwiper.value?.swiper?.slideTo(index);
	}
	function setArtworkStripRef(id: string, element: HTMLElement | null) {
		if (element) artworkStrips.set(id, element);
		else artworkStrips.delete(id);
	}
	function scrollArtwork(id: string, direction: -1 | 1) {
		const strip = artworkStrips.get(id);
		strip?.scrollBy({
			left: direction * Math.max((strip?.clientWidth ?? 0) * 0.62, 240),
			behavior: "smooth",
		});
	}
	function focusArtwork(id: string, event: MouseEvent) {
		const strip = artworkStrips.get(id);
		const tile = (event.currentTarget as HTMLElement).parentElement;
		if (!strip || !tile) return;
		strip.scrollTo({
			left: tile.offsetLeft - (strip.clientWidth - tile.clientWidth) / 2,
			behavior: "smooth",
		});
	}
	const questionsExpanded = (id: string) => expandedQuestions.value.has(id);
	const visibleQuestions = (entry: ArtistHighlightEntry) =>
		questionsExpanded(entry._id)
			? entry.questions
			: entry.questions.slice(0, 1);
	function toggleQuestions(id: string) {
		const next = new Set(expandedQuestions.value);
		next.has(id) ? next.delete(id) : next.add(id);
		expandedQuestions.value = next;
	}
	const signatureStroke = (entry: ArtistHighlightEntry) =>
		calculateSignatureStroke(customization(entry).signatureViewBox);

	function openArtist(entry: ArtistHighlightEntry, index: number) {
		if (index !== activeArtistSlide.value) {
			artistSwiper.value?.swiper?.slideTo(index);
			return;
		}
		void openUserActions(entry.artist);
	}
	async function openDrawing(posts: FeedPost[], index: number) {
		await captureOverlayScroll();
		fullscreenOpen = true;
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
		user.value.artist_highlights = { ...previous, ...payload };
		try {
			await updateArtistHighlightPreferences(payload);
		} catch {
			if (user.value) user.value.artist_highlights = previous;
			toast("Could not update artist highlights", { color: "danger" });
		}
	}
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

	return {
		config,
		loading,
		visible,
		endOverlay,
		activeArtistSlide,
		artistSwiper,
		customization,
		theme,
		palette,
		fontFamily,
		fontClass,
		cardStyle,
		identityStyle,
		scrimStyle,
		onArtistSlideChange,
		activateArtistSlide,
		setArtworkStripRef,
		scrollArtwork,
		focusArtwork,
		questionsExpanded,
		visibleQuestions,
		toggleQuestions,
		signatureStroke,
		openArtist,
		openDrawing,
		beginOverlay,
		openHideMenu,
	};
}
