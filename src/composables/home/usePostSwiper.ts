import { usePhotoSwiper } from "@/store/photoswiper.store";
import { useToast } from "@/service/toast.service";
import { isInRoom } from "@/draw/sync/syncStatus";
import router from "@/router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { deletePost, postComment } from "@/service/api/post.api";
import { usePostStore } from "@/store/post.store";
import { useUserCacheStore } from "@/store/userCache.store";
import { alertController } from "@ionic/vue";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";

export function usePostSwiper() {
	const swiperStore = usePhotoSwiper();
	const { toast } = useToast();
	const postStore = usePostStore();

	function openPostSwiper(posts: any[], index: number) {
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
			canReply: (item) => !!item.enable_remix,
			onReply: async (item) => {
				if (isInRoom()) {
					toast("Not allowed when in a lobby", { color: "warning" });
					return;
				}

				const alert = await alertController.create({
					header: "Remix this Drawing?",
					message:
						"This will load a copy of this drawing onto your canvas so you can edit and reply to it.",
					cssClass: "liquid-alert",
					buttons: [
						{ text: "Cancel", role: "cancel", cssClass: "alert-button-cancel" },
						{
							text: "Start Remixing",
							cssClass: "alert-button-confirm",
							handler: () => {
								swiperStore.close();

								router.push({
									path: FRONTEND_ROUTES.draw,
									query: {
										canvas_url: item.drawing_url || item.drawing,
										mode: "solo",
									},
								});
							},
						},
					],
				});
				await alert.present();
			},
			canDelete: (item, currentUser) => item.author_id === currentUser._id,
			userLookup: (userId: string) => {
				return useUserCacheStore().getUser(userId);
			},
			onDelete: async (item) => {
				try {
					swiperStore.open = false;
					await deletePost(item._id);
					toast("Post deleted", { color: "success" });
					postStore.removePostLocally(item._id);
				} catch (e) {
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
