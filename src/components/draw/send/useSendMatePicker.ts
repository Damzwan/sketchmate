import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
	hydrateCustomization,
	resolveFontFamily,
	resolveTheme,
} from "@/config/profile_options.config";
import { MAX_SEND_MATES, useMateSelection } from "@/draw/sharing/mateSelection";
import { recentActivityForPartner } from "@/helper/chat.helper";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useFriendStore } from "@/store/friend.store";
import { useParentalStore } from "@/store/parental.store";
import { useUserCacheStore } from "@/store/userCache.store";

export function useSendMatePicker() {
	const { user } = storeToRefs(useAuthStore());
	const parental = useParentalStore();
	const friendStore = useFriendStore();
	const userCache = useUserCacheStore();
	const { activeChats } = storeToRefs(useChatStore());
	const { allConnectedPartners, networkLists, networkLoading, hasMore } =
		storeToRefs(friendStore);
	const {
		selected,
		toggle,
		isFull: mateLimitReached,
		reset: resetMates,
	} = useMateSelection();
	const { toast } = useToast();

	const mateSearch = ref("");
	const matePage = ref(1);
	const loadingMoreMates = ref(false);
	const mateScroll = ref<HTMLElement | null>(null);
	const mateSentinel = ref<HTMLElement | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let observer: IntersectionObserver | null = null;

	const hasMates = computed(
		() =>
			(user.value?.stats?.mates ?? 0) > 0 ||
			allConnectedPartners.value.length > 0,
	);
	const mateSendLocked = computed(
		() => parental.isChildAccount && !parental.isAllowed("mate_send"),
	);
	const canPickMates = computed(() => hasMates.value && !mateSendLocked.value);

	const fetchedMates = computed(() => {
		if (!mateSearch.value.trim()) return allConnectedPartners.value;
		return networkLists.value.mates.map((entry) => ({
			...(userCache.getUser(entry._id) || {
				_id: entry._id,
				name: "Artist",
				img: "",
			}),
			...entry,
		}));
	});

	const displayMates = computed(() => {
		const mates = new Map<string, any>();
		for (const id of selected.value) {
			const mate = friendStore.resolvePartnerInfo(id);
			if (mate) mates.set(mate._id, mate);
		}
		for (const mate of fetchedMates.value) {
			if (!mates.has(mate._id)) mates.set(mate._id, mate);
		}

		return [...mates.values()].sort((a, b) => {
			const selectedDelta =
				Number(selected.value.has(b._id)) - Number(selected.value.has(a._id));
			if (selectedDelta) return selectedDelta;

			const recentDelta =
				recentActivityForPartner(
					activeChats.value,
					b._id,
					b.last_interaction_at,
				) -
				recentActivityForPartner(
					activeChats.value,
					a._id,
					a.last_interaction_at,
				);
			if (recentDelta) return recentDelta;

			return Number(isOnline(b._id)) - Number(isOnline(a._id));
		});
	});

	function toggleMate(id: string) {
		if (!toggle(id)) toast(`You can send to ${MAX_SEND_MATES} mates at a time`);
	}

	function isOnline(id: string) {
		return friendStore.isFriendOnline(id);
	}

	function mateCustomization(mate: any) {
		return hydrateCustomization(mate?.customization);
	}

	function mateTileStyle(mate: any) {
		const theme = resolveTheme(mateCustomization(mate).themeId);
		return {
			background: theme.cardBg,
			borderColor: selected.value.has(mate._id)
				? "var(--ion-color-secondary)"
				: theme.cardBorderColor,
		};
	}

	function mateNameStyle(mate: any) {
		const customization = mateCustomization(mate);
		const theme = resolveTheme(customization.themeId);
		return {
			color: theme.nameColor,
			fontFamily: resolveFontFamily(customization.fontId),
		};
	}

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
		} catch (error) {
			console.error("Failed to load mates:", error);
		}
	}

	function onMateSearch() {
		if (debounceTimer) clearTimeout(debounceTimer);
		if (!mateSearch.value.trim()) {
			void fetchMates(true);
			return;
		}
		debounceTimer = setTimeout(() => void fetchMates(true), 400);
	}

	function clearMateSearch() {
		mateSearch.value = "";
		if (debounceTimer) clearTimeout(debounceTimer);
		void fetchMates(true);
	}

	async function loadMoreMates() {
		const term = mateSearch.value.trim();
		if (
			!hasMore.value ||
			loadingMoreMates.value ||
			networkLoading.value ||
			(term.length > 0 && term.length < 3)
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

	function attachObserver() {
		observer?.disconnect();
		if (!mateSentinel.value) return;
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) void loadMoreMates();
			},
			{ root: mateScroll.value, threshold: 0.1 },
		);
		observer.observe(mateSentinel.value);
	}

	watch(mateSentinel, attachObserver);
	onMounted(() => {
		void fetchMates(true);
		attachObserver();
	});
	onBeforeUnmount(() => {
		observer?.disconnect();
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	return {
		MAX_SEND_MATES,
		selected,
		mateLimitReached,
		resetMates,
		mateSearch,
		matePage,
		loadingMoreMates,
		mateScroll,
		mateSentinel,
		networkLoading,
		hasMates,
		mateSendLocked,
		canPickMates,
		displayMates,
		toggleMate,
		isOnline,
		mateCustomization,
		mateTileStyle,
		mateNameStyle,
		onMateSearch,
		clearMateSearch,
		openParentalControls: () => void parental.openControls(),
	};
}
