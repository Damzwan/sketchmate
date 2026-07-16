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

				const isOnDrawPage =
					router.currentRoute.value.path === `/${FRONTEND_ROUTES.draw}`;

				const alert = await alertController.create({
					header: "Copy and Edit Drawing?",
					subHeader: isOnDrawPage
						? "This will replace your current canvas."
						: "Create a copy of this drawing to make your own edits.",
					message: isOnDrawPage
						? "Your current unsaved changes will be lost. Do you want to load this drawing as a new template?"
						: "This will open a copy of the drawing in your workspace. Your original drawing remains safe.",
					cssClass: "liquid-alert",
					buttons: [
						{ text: "Cancel", role: "cancel", cssClass: "alert-button-cancel" },
						{
							text: "Copy & Edit",
							cssClass: "alert-button-confirm",
							handler: async () => {
								swiperStore.close();

								const queryParams = {
									canvas_url: item.drawing,
									mode: "solo",
									id: crypto.randomUUID(),
								};

								if (isOnDrawPage) {
									await router.replace({ query: queryParams });

									const { useDrawStore } = await import(
										"@/draw/store/draw.store"
									);
									const drawStore = useDrawStore();
									const mainCanvasElement = document.getElementById(
										"mainCanvas",
									) as HTMLCanvasElement;

									if (mainCanvasElement) {
										await drawStore.initCanvas(mainCanvasElement, {
											isLobby: false,
											draftId: queryParams.id,
											canvasUrl: queryParams.canvas_url,
										});
									}
								} else {
									router.push({
										path: FRONTEND_ROUTES.draw,
										query: queryParams,
									});
								}
							},
						},
					],
				});
				await alert.present();
			},

			// Try inbox users first, fall back to userCache
			userLookup: (userId: string) => {
				return findUserInInboxUsers(userId) || userCache.getUser(userId);
			},

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
