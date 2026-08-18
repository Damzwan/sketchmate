import { storeToRefs } from "pinia";
import { useDrawingRemix } from "@/composables/gallery/useDrawingRemix";
import {
	commentOnInbox,
	removeFromInbox,
	seeInboxItem,
} from "@/service/api/inbox.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useInboxStore } from "@/store/inbox.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { useUserCacheStore } from "@/store/userCache.store";
import type { InboxItem } from "@/types/server.types";

export function useInboxSwiper() {
	const swiperStore = usePhotoSwiper();
	const { toast } = useToast();
	const { user } = storeToRefs(useAuthStore());
	const { removeFromLocalInbox, findUserInInboxUsers } = useInboxStore();

	const userCache = useUserCacheStore();
	const { openDrawingCopy } = useDrawingRemix();

	function seeItem(item: InboxItem) {
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

	function openInboxSwiper(inboxItems: InboxItem[], index: number) {
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
				} catch (_e) {
					toast("Failed to delete item from server", { color: "danger" });
				}
			},

			canReply: true,
			onReply: async (item) => {
				await openDrawingCopy({
					canvasUrl: item.drawing,
					header: "Copy and Edit Drawing?",
					message:
						"This will open a copy of the drawing in your workspace. Your original drawing remains safe.",
					confirmText: "Copy & Edit",
					replaceCurrent: {
						subHeader: "This will replace your current canvas.",
						message:
							"Your current unsaved changes will be lost. Do you want to load this drawing as a new template?",
					},
				});
			},

			// Try inbox users first, fall back to userCache
			userLookup: (userId: string) => {
				return findUserInInboxUsers(userId) || userCache.getUser(userId);
			},

			canDelete: () => true,

			onComment: async (item, message) => {
				if (!user.value) return;

				try {
					const comment = await commentOnInbox(item._id, {
						message: message,
						followers: item.followers,
					});

					const { addComment } = useInboxStore();
					addComment({ comment, inbox_item_id: item._id });
				} catch (error) {
					console.error("Failed to post comment:", error);
				}
			},
		});
	}

	// 3. Export both so Gallery.vue can use seeItem on hover!
	return { openInboxSwiper, seeItem };
}
