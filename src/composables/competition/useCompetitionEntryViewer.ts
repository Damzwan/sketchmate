import { useConfirm } from "@/composables/useConfirm";
import router from "@/router";
import type { CompetitionEntry } from "@/service/api/competition.api";
import { useToast } from "@/service/toast.service";
import { useCompetitionStore } from "@/store/competition.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

/** Read-only fullscreen competition entry viewer used outside the page. */
export function useCompetitionEntryViewer() {
	const swiper = usePhotoSwiper();
	const { toast } = useToast();
	const { confirm } = useConfirm();

	async function remix(entry: CompetitionEntry) {
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
		swiper.close();
		void router.push({
			path: FRONTEND_ROUTES.draw,
			query: { canvas_url: entry.drawing_url, mode: "solo" },
		});
	}

	function openEntry(entry: CompetitionEntry, withComments = false) {
		swiper.openSwiper([entry], 0, {
			type: "competition",
			imageResolver: (item) => item.image_url,
			thumbnailResolver: (item) => item.thumbnail_url,
			canReply: (item) => !!item.drawing_url,
			onReply: remix,
		});
		if (withComments) swiper.isCommentDrawerOpen = true;
	}

	async function openEntryById(entryId: string, withComments = false) {
		const entry = await useCompetitionStore().resolveEntry(entryId);
		if (!entry) {
			toast("That entry is no longer available", { color: "warning" });
			return false;
		}
		openEntry(entry, withComments);
		return true;
	}

	return { openEntry, openEntryById };
}
