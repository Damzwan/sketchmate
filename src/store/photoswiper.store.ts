import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface SwiperConfig {
	type?: "post" | "inbox";
	onSeen?: (item: any) => void;
	onDelete?: (item: any) => void;
	onReply?: (item: any) => void;
	userLookup?: (userId: string) => any; // Function to resolve user details (name, avatar)
	canDelete?: (item: any, user: any) => boolean; // Custom delete logic
	canReply?: boolean; // Toggle reply button
	imageResolver?: (item: any) => string;
	thumbnailResolver?: (item: any) => string;
	onComment?: (item: any, message: string) => Promise<void>;
	onReact?: (item: any, type: string) => Promise<void>;
}

export const usePhotoSwiper = defineStore("photoswiper", () => {
	const open = ref(false);
	// Monotonic stamp of the last open — lets another overlay (the user sheet)
	// tell whether it opened ABOVE this swiper or was already underneath it.
	const openedAt = ref(0);
	const slide = ref(0);
	const collection = ref<any[]>([]);
	const config = ref<SwiperConfig>({});

	const isCommentDrawerOpen = ref(false);

	const currentItem = computed(() => collection.value[slide.value]);

	function openSwiper(
		items: any[],
		startIndex = 0,
		swiperConfig: SwiperConfig = {},
	) {
		config.value = swiperConfig;
		collection.value = items;
		slide.value = startIndex;
		open.value = true;
		openedAt.value = Date.now();
	}

	function seeItem() {
		if (!currentItem.value) return;

		if (config.value.onSeen) {
			config.value.onSeen(currentItem.value);
		}
	}

	function close() {
		open.value = false;
	}

	return {
		open,
		openedAt,
		slide,
		collection,
		currentItem,
		config,
		openSwiper,
		seeItem,
		close,
		isCommentDrawerOpen,
	};
});
