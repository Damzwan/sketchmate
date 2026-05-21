import { Ref, ref } from "vue";
import { useToast } from "@/service/toast.service";
import { useInboxStore } from "@/store/inbox.store";
import { shareImages } from "@/helper/share.helper";
import { InboxItem, User } from "@/types/server.types";
import { removeFromInbox } from "@/service/api/inbox.api";

export function useGallerySelection(
	user: Ref<User | undefined>,
	inbox: Ref<InboxItem[]>,
	openPhotoSwiper: (item: any) => void,
) {
	const { toast } = useToast();
	const { removeFromLocalInbox, getInboxBatch } = useInboxStore();

	const multiSelectMode = ref(false);
	const selectedItems = ref<string[]>([]);
	const alterTrigger = ref<any>();

	function onItemLongPress(item: any) {
		if (multiSelectMode.value) return;
		if (window.navigator.vibrate) window.navigator.vibrate(40);
		multiSelectMode.value = true;
		selectedItems.value.push(item._id);
	}

	function onThumbnailClick(item: any) {
		if (!multiSelectMode.value) {
			openPhotoSwiper(item);
		} else {
			const idx = selectedItems.value.indexOf(item._id);
			if (idx === -1) {
				selectedItems.value.push(item._id);
			} else {
				selectedItems.value.splice(idx, 1);
				if (selectedItems.value.length === 0) cancelMultiSelect();
			}
		}
	}

	function cancelMultiSelect() {
		multiSelectMode.value = false;
		selectedItems.value = [];
	}

	async function handleShare() {
		const itemsToShare = inbox.value.filter((i: any) =>
			selectedItems.value.includes(i._id),
		);
		if (itemsToShare.length === 0) return;

		// Extract just the image URLs into an array
		const imageUrls = itemsToShare.map((item) => item.image);

		try {
			await shareImages(
				imageUrls,
				"Check out my sketches!",
				"Share with friends",
			);
		} catch (e) {
			console.error("Sharing error", e);
			toast("Failed to share images", { color: "danger" });
		}
	}

	async function deleteInboxItems() {
		const toDelete = [...selectedItems.value];
		cancelMultiSelect();

		toDelete.forEach((id) => removeFromLocalInbox(id));
		toast(`Removing ${toDelete.length} drawings...`);

		try {
			await Promise.all(
				toDelete.map((id) =>
					removeFromInbox({ user_id: user.value!._id, inbox_id: id }),
				),
			);
		} catch (e) {
			toast("Some items could not be deleted.", { color: "danger" });
			await getInboxBatch(true);
		}
	}

	return {
		multiSelectMode,
		selectedItems,
		alterTrigger,
		onItemLongPress,
		onThumbnailClick,
		cancelMultiSelect,
		handleShare,
		deleteInboxItems,
	};
}
