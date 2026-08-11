import { useIonRouter } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, type Ref, ref } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import {
	type CompetitionEntry,
	withdrawEntry,
} from "@/service/api/competition.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useCompetitionStore } from "@/store/competition.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

interface ViewerOptions {
	selectedEntry: Ref<CompetitionEntry | null>;
	openOverlay: (present: () => void) => Promise<void>;
	captureOverlayScroll: () => Promise<void>;
	guardScroll: (duration?: number, cancelOnIntent?: boolean) => void;
}

export function useCompetitionPageEntryActions(options: ViewerOptions) {
	const router = useIonRouter();
	const store = useCompetitionStore();
	const photoSwiper = usePhotoSwiper();
	const { competition, entries } = storeToRefs(store);
	const { user } = storeToRefs(useAuthStore());
	const { toast } = useToast();
	const { confirm } = useConfirm();
	const myEntryOpen = ref(false);

	const currentEntry = computed<CompetitionEntry | null>(() => {
		const own = store.myEntry;
		const currentCompetition = competition.value;
		const currentUser = user.value;
		if (!own || !currentCompetition || !currentUser) return null;
		const loaded = entries.value.find((entry) => entry._id === own._id);
		if (loaded) return loaded;

		return {
			_id: own._id,
			competition_id: own.competition_id ?? currentCompetition._id,
			author_id: own.author_id ?? currentUser._id,
			author: {
				_id: currentUser._id,
				name: currentUser.name,
				img: currentUser.img,
				customization: currentUser.customization as any,
				stats: currentUser.stats as any,
			},
			drawing_url: own.drawing_url ?? "",
			image_url: own.image_url ?? own.thumbnail_url,
			thumbnail_url: own.thumbnail_url,
			aspect_ratio: own.aspect_ratio ?? 1,
			caption: own.caption ?? "",
			caption_filtered: own.caption_filtered ?? "",
			is_winner: own.is_winner,
			won_category: own.won_category,
			vote_counts: own.vote_counts,
			total_votes: own.total_votes,
			my_votes: [],
			comment_count: own.comment_count ?? 0,
			submitted_at: own.submitted_at ?? new Date().toISOString(),
		};
	});

	function openCurrentEntry() {
		if (!currentEntry.value) return;
		void options.openOverlay(() => (myEntryOpen.value = true));
	}

	async function openCompetitionFullscreen(entry: CompetitionEntry) {
		const collection = entries.value.some((item) => item._id === entry._id)
			? entries.value
			: [entry];
		const index = Math.max(
			0,
			collection.findIndex((item) => item._id === entry._id),
		);
		await options.captureOverlayScroll();
		myEntryOpen.value = false;
		photoSwiper.openSwiper(collection, index, {
			type: "competition",
			imageResolver: (item) => item.image_url,
			thumbnailResolver: (item) => item.thumbnail_url,
			canReply: (item) => !!item.drawing_url,
			onReply: remixCompetitionEntry,
			canVote: (item, viewer) =>
				store.canVote && item.author_id !== viewer?._id,
			onVote: openVoteFromFullscreen,
			canDelete: (item, viewer) =>
				store.canSubmit && item.author_id === viewer?._id,
			onDelete: async (item) => deleteCurrentEntry(item, false),
		});
		options.guardScroll(350);
	}

	function openVoteFromFullscreen(entry: CompetitionEntry) {
		photoSwiper.close();
		setTimeout(() => {
			options.selectedEntry.value =
				entries.value.find((item) => item._id === entry._id) ?? entry;
		}, 220);
	}

	async function remixCompetitionEntry(entry: CompetitionEntry) {
		if (!entry.drawing_url) {
			toast("This drawing cannot be remixed", { color: "warning" });
			return;
		}
		const approved = await confirm({
			header: "Remix this drawing?",
			message: "A copy will open on your canvas. The original stays unchanged.",
			confirmText: "Start remixing",
		});
		if (!approved) return;
		myEntryOpen.value = false;
		photoSwiper.close();
		void router.push({
			path: FRONTEND_ROUTES.draw,
			query: { canvas_url: entry.drawing_url, mode: "solo" },
		});
	}

	async function deleteCurrentEntry(
		entry: CompetitionEntry,
		shouldConfirm = true,
	) {
		if (
			shouldConfirm &&
			!(await confirm({
				header: "Delete your entry?",
				message:
					"Its votes and comments will also be removed. You can submit another entry while submissions are open.",
				cancelText: "Keep it",
				confirmText: "Delete entry",
				destructive: true,
			}))
		)
			return;
		try {
			await withdrawEntry(entry.competition_id);
			store.removeOwnEntry(entry._id);
			myEntryOpen.value = false;
			toast("Competition entry deleted", { color: "success" });
		} catch {
			toast("This entry can no longer be deleted", { color: "danger" });
		}
	}

	return {
		myEntryOpen,
		currentEntry,
		openCurrentEntry,
		openCompetitionFullscreen,
		remixCompetitionEntry,
		deleteCurrentEntry,
	};
}
