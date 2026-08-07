import { defineStore } from "pinia";
import { computed, ref } from "vue";

export interface SwiperConfig {
	type?: "post" | "inbox";
	onSeen?: (item: any) => void;
	onDelete?: (item: any) => void;
	onReply?: (item: any) => void;
	userLookup?: (userId: string) => any; // Function to resolve user details (name, avatar)
	canDelete?: (item: any, user: any) => boolean; // Custom delete logic
	// Per-item, like canDelete — a plain boolean can't express "this collection
	// supports remixing but THIS post has it switched off", which is exactly the
	// case for posts with `enable_remix === false`.
	canReply?: boolean | ((item: any, user: any) => boolean);
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

	// Called only after the modal's leave animation. Dropping these references
	// unmounts slide images and lets the WebView release their decoded bitmaps.
	function releaseRetainedContent() {
		collection.value = [];
		config.value = {};
		slide.value = 0;
		isCommentDrawerOpen.value = false;
	}

	function resetRuntimeState() {
		open.value = false;
		openedAt.value = 0;
		releaseRetainedContent();
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
		releaseRetainedContent,
		isCommentDrawerOpen,
		resetRuntimeState,
	};
});
