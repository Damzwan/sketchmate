import {
	mdiCardAccountDetailsOutline,
	mdiChatOutline,
	mdiImageOutline,
} from "@mdi/js";
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import exampleImg from "@/assets/example.webp";
import { useSnapPager } from "@/composables/general/useSnapPager";
import type { Customization } from "@/config/profile_options.config";
import { useAmbientPause } from "@/store/ambientPause.store";

type Mode = "card" | "post" | "chat";
interface PreviewPagerProps {
	user?: any;
	customization: Partial<Customization>;
	active: boolean;
	paneWidth: string;
	postImgMaxHeight: string;
	cardZoom: number;
	postZoom: number;
	chatZoom: number;
}

export function usePreviewSurfacePager(props: PreviewPagerProps) {
	const tabs: { id: Mode; label: string; icon: string }[] = [
		{ id: "card", label: "Card", icon: mdiCardAccountDetailsOutline },
		{ id: "post", label: "Post", icon: mdiImageOutline },
		{ id: "chat", label: "Chat", icon: mdiChatOutline },
	];
	const mode = ref<Mode>("card");
	const zoomOpen = ref(false);
	const zoomMode = ref<Mode>("card");
	const visited = reactive(new Set<Mode>());
	const ambient = useAmbientPause();
	let holdingAmbient = false;
	let neighborTimer = 0;

	const pagerVars = computed(() => ({
		"--pane-w": props.paneWidth,
		"--post-img-max-h": props.postImgMaxHeight,
	}));
	const zooms = computed<Record<Mode, number>>(() => ({
		card: props.cardZoom,
		post: props.postZoom,
		chat: props.chatZoom,
	}));
	const zoomStyle = (id: Mode) => {
		const zoom = zooms.value[id] || 1;
		return {
			transform: `scale(${zoom})`,
			transformOrigin: "top center",
			width: `calc(100% / ${zoom})`,
		};
	};
	const openZoom = () => {
		zoomMode.value = mode.value;
		zoomOpen.value = true;
	};

	watch(zoomOpen, (open) => {
		if (open && !holdingAmbient) {
			holdingAmbient = true;
			ambient.hold();
		} else if (!open && holdingAmbient) {
			holdingAmbient = false;
			ambient.release();
		}
	});

	function markVisited(id: Mode) {
		const index = tabs.findIndex((tab) => tab.id === id);
		visited.add(id);
		if (tabs[index - 1]) visited.add(tabs[index - 1].id);
		if (tabs[index + 1]) visited.add(tabs[index + 1].id);
	}

	const { pagerRef, scrollToPane, setActive, onPaneClick, onPagerScroll } =
		useSnapPager(
			tabs.map((tab) => tab.id),
			mode,
			{ onChange: markVisited },
		);

	watch(
		() => props.active,
		async (active) => {
			window.clearTimeout(neighborTimer);
			if (!active) {
				zoomOpen.value = false;
				visited.clear();
				return;
			}
			mode.value = "card";
			visited.clear();
			visited.add("card");
			await nextTick();
			scrollToPane(0, false);
			neighborTimer = window.setTimeout(() => markVisited(mode.value), 450);
		},
		{ immediate: true },
	);

	onBeforeUnmount(() => {
		window.clearTimeout(neighborTimer);
		if (holdingAmbient) ambient.release();
	});

	const mockToast = computed(() => ({
		tabId: "preview-toast",
		subtitle: props.user?.name ?? "You",
		title: "Lobby",
		text: "You hopped into the room!",
		img: props.user?.img,
		isTrial: false,
		isRequest: false,
		isJoin: true,
		customization: props.customization,
	}));
	const mockPost = computed(() => ({
		_id: "preview-post",
		author_id: props.user?._id ?? "preview-me",
		author: {
			_id: props.user?._id ?? "preview-me",
			name: props.user?.name ?? "You",
			img: props.user?.img,
			avatar: props.user?.img,
			customization: props.customization,
		},
		image_url: exampleImg,
		drawing_url: exampleImg,
		description: props.user?.description || "Fresh from the canvas ✨",
		createdAt: new Date().toISOString(),
		reaction_counts: { love: 12, fire: 4 },
		user_reaction: null,
		comment_count: 0,
		comments: [],
		views: 128,
		enable_comments: true,
		enable_remix: true,
	}));
	const mockChat = computed(() => ({
		_id: "preview-chat",
		participants: [
			{ _id: "preview-me", name: "You" },
			{
				_id: "preview-partner",
				name: props.user?.name ?? "You",
				img: props.user?.img,
				customization: props.customization,
			},
		],
		status: "active",
		initiator_id: "preview-me",
		last_message: { type: "text", content: "This is how your chats look 🎨" },
		unread_counts: { "preview-me": 2 },
		updatedAt: new Date().toISOString(),
	}));

	return {
		pagerVars,
		tabs,
		mode,
		zoomOpen,
		zoomMode,
		openZoom,
		zooms,
		zoomStyle,
		visited,
		pagerRef,
		setMode: setActive,
		onPaneClick,
		onPagerScroll,
		mockToast,
		mockPost,
		mockChat,
	};
}
