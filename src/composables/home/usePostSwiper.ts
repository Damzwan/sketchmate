import { useDrawingRemix } from "@/composables/gallery/useDrawingRemix";
import { syncPostQuotaResetReminder } from "@/helper/notification.helper";
import { deletePost } from "@/service/api/post.api";
import { useToast } from "@/service/toast.service";
import { useMenuStore } from "@/store/menu.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { usePostStore } from "@/store/post.store";
import { useQuotaStore } from "@/store/quota.store";
import { useUserCacheStore } from "@/store/userCache.store";
import { Menu } from "@/types/menu.types";
import type { FeedPost } from "@/types/server.types";

export function usePostSwiper() {
	const swiperStore = usePhotoSwiper();
	const { toast } = useToast();
	const postStore = usePostStore();
	const quotaStore = useQuotaStore();
	const { openDrawingCopy } = useDrawingRemix();

	function openPostSwiper(posts: FeedPost[], index: number) {
		if (swiperStore.open && useMenuStore().viewProfileMenuOpen) {
			useMenuStore().closeMenu(Menu.ViewProfileMenu);
			if (swiperStore.isCommentDrawerOpen) {
				swiperStore.isCommentDrawerOpen = false;
			}
		}

		swiperStore.openSwiper(posts, index, {
			type: "post",
			imageResolver: (item) => item.image_url,
			thumbnailResolver: (item) => item.thumbnail_url,
			// Exactly FeedPostCard's `v-if="post.enable_remix"`, so the fullscreen
			// viewer and the feed card can't disagree about a post. (The server
			// normalises the field with `?? true` on every read path, so legacy
			// posts arrive as a real boolean rather than undefined.)
			canReply: (item, currentUser) =>
				item.author_id === currentUser?._id || !!item.enable_remix,
			onReply: async (item) => {
				await openDrawingCopy({
					canvasUrl: item.drawing_url || item.drawing,
					header: "Remix this Drawing?",
					message:
						"This will load a copy of this drawing onto your canvas so you can edit and reply to it.",
					confirmText: "Start Remixing",
				});
			},
			canDelete: (item, currentUser) => item.author_id === currentUser._id,
			userLookup: (userId: string) => {
				return useUserCacheStore().getUser(userId);
			},
			onDelete: async (item) => {
				try {
					swiperStore.open = false;
					const { post_quota } = await deletePost(item._id);
					const currentPostQuota = await quotaStore.syncPostQuota(post_quota);
					void syncPostQuotaResetReminder(currentPostQuota);
					toast("Post deleted", { color: "success" });
					postStore.removePostLocally(item._id);
				} catch (_e) {
					toast("Failed to delete post", { color: "danger" });
				}
			},
			onReact: async (item, type) => {
				// Pass the swiper's own item so its footer count updates even when it's
				// a separate object from the ones in the feed/profile lists.
				await postStore.toggleReactionLocally(item._id, type, item);
			},
			// onComment NOT needed for posts — drawer hits postComment API directly
		});
	}

	return { openPostSwiper };
}
