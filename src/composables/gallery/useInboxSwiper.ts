import { storeToRefs } from "pinia";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useInboxStore } from "@/store/inbox.store";
import {
	commentOnInbox,
	removeFromInbox,
	seeInboxItem,
} from "@/service/api/inbox.api";
import { useUserCacheStore } from "@/store/userCache.store";
import { isInRoom } from "@/draw/helpers/drawSyncing.helper";
import router from "@/router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { alertController } from "@ionic/vue";

export function useInboxSwiper() {
	const swiperStore = usePhotoSwiper();
	const { toast } = useToast();
	const { user } = storeToRefs(useAuthStore());
	const { removeFromLocalInbox, findUserInInboxUsers, addComment } =
		useInboxStore();

	const userCache = useUserCacheStore();

	function seeItem(item: any) {
		if (!item._id || !user.value) return;
		const userId = user.value._id;
		if (
			!item.seen_by?.includes(userId) ||
			!item.comments_seen_by?.includes(userId)
		) {
			seeInboxItem({ user_id: userId, inbox_id: item._id });
			item.seen_by?.push(userId);
			item.comments_seen_by?.push(userId);
		}
	}

	function openInboxSwiper(inboxItems: any[], index: number) {
		swiperStore.openSwiper(inboxItems, index, {
			type: "inbox",
			imageResolver: (item) => item.image,
			thumbnailResolver: (item) => item.thumbnail,
			onSeen: seeItem,

			onDelete: async (item) => {
				removeFromLocalInbox(item._id);
				toast("Item deleted");
				try {
					await removeFromInbox({
						user_id: user.value!._id,
						inbox_id: item._id,
					});
				} catch (e) {
					toast("Failed to delete item from server", { color: "danger" });
				}
			},

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
										canvas_url: item.drawing,
										mode: "solo",
									},
								});
							},
						},
					],
				});
				await alert.present();
			},

			// Try inbox users first, fall back to userCache
			userLookup: (userId: string) =>
				findUserInInboxUsers(userId) || userCache.getUser(userId),

			canDelete: () => true,

			onComment: async (item, message) => {
				if (!user.value) return;

				try {
					const commentRes: any = await commentOnInbox(item._id, {
						message: message,
						followers: item.followers,
					});

					const { addComment } = useInboxStore();
					addComment(commentRes);
				} catch (error) {
					console.error("Failed to post comment:", error);
				}
			},
		});
	}

	// 3. Export both so Gallery.vue can use seeItem on hover!
	return { openInboxSwiper, seeItem };
}
