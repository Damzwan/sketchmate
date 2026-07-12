import { usePhotoSwiper } from "@/store/photoswiper.store";
import { useToast } from "@/service/toast.service";
import { isInRoom } from "@/draw/helpers/drawSyncing.helper";
import router from "@/router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { deletePost, postComment } from "@/service/api/post.api";
import { usePostStore } from "@/store/post.store";
import { useUserCacheStore } from "@/store/userCache.store";
import { alertController } from "@ionic/vue";

export function usePostSwiper() {
	const swiperStore = usePhotoSwiper();
	const { toast } = useToast();
	const postStore = usePostStore();

	function openPostSwiper(posts: any[], index: number) {
		swiperStore.openSwiper(posts, index, {
			type: "post",
			imageResolver: (item) => item.image_url,
			thumbnailResolver: (item) => item.thumbnail_url,
			canReply: true,
			onReply: async (item) => {
				if (isInRoom()) {
					toast("Not allowed when in a lobby", { color: "warning" });
					return;
				}
				const alert = await alertController.create({
					header: "Start New Session?",
					subHeader: "This will leave your current lobby.",
					message:
						"You are about to start a private drawing session based upon this post.",
					cssClass: "liquid-alert",
					buttons: [
						{ text: "Cancel", role: "cancel", cssClass: "alert-button-cancel" },
						{
							text: "Start Drawing",
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
