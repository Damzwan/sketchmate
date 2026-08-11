import { useConfirm } from "@/composables/useConfirm";
import router from "@/router";
import type { CompetitionEntry } from "@/service/api/competition.api";
import { useToast } from "@/service/toast.service";
import { useCompetitionStore } from "@/store/competition.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

/**
 * Open one competition entry in the fullscreen viewer from anywhere.
 *
 * The notification list uses this: tapping "someone commented on your entry"
 * should show the drawing and the thread where the user already is, not push
 * them onto the competition page and leave them there when they close it.
 *
 * Deliberately a read-only viewer: no voting, no deleting. Those belong to the
 * competition page, which owns the vote budget and the grid the deletion has to
 * be removed from. Remixing is safe from anywhere because it only opens the
 * canvas.
 */
export function useCompetitionEntryViewer() {
	const swiper = usePhotoSwiper();
	const { toast } = useToast();
	const { confirm } = useConfirm();

	async function remix(entry: CompetitionEntry) {
		if (!entry.drawing_url) {
			toast("This drawing cannot be remixed", { color: "warning" });
			return;
		}
		const shouldRemix = await confirm({
			header: "Remix this drawing?",
			message: "A copy will open on your canvas. The original stays unchanged.",
			confirmText: "Start remixing",
		});
		if (!shouldRemix) return;
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

	/** Resolve by id first — a deep link rarely has the entry in hand. */
	async function openEntryById(
		entryId: string,
		withComments = false,
	): Promise<boolean> {
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
