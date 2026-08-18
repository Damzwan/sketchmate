import { useToast } from "@/service/toast.service";
import { usePostStore } from "@/store/post.store";
import type { FeedPost } from "@/types/server.types";

/**
 * One place the "save this post" gesture lives, so the feed card, the fullscreen
 * viewer and the saved list can't drift on what it does or what it says.
 *
 * The store owns the optimistic flip and its rollback; this only decides what
 * the user is told about it.
 */
export function useSavePost() {
	const { toast } = useToast();
	const postStore = usePostStore();

	/**
	 * @param target the exact object being rendered, when it may not be one of
	 * the copies the store already tracks (the photoswiper's `currItem`).
	 */
	async function toggleSave(post: FeedPost, target?: FeedPost) {
		try {
			const saved = await postStore.toggleSaveLocally(post._id, target);
			toast(saved ? "Saved to your collection" : "Removed from saved", {
				color: "success",
			});
			return saved;
		} catch (error) {
			console.error("Failed to toggle save:", error);
			toast("Could not update your saved posts", { color: "danger" });
			return post.is_saved ?? false;
		}
	}

	return { toggleSave };
}
