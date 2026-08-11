import { onIonViewDidEnter, useIonRouter } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import {
	type DrawingDraftMetadata,
	useDocumentStore,
} from "@/draw/document/document.store";
import { masterAnimation } from "@/helper/animation.helper";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { FRONTEND_ROUTES } from "@/types/router.types";

export function useHomeDrafts() {
	const router = useIonRouter();
	const documents = useDocumentStore();
	const { pendingDraftsList, removedDraftIds } = storeToRefs(documents);
	const savedDrafts = ref<DrawingDraftMetadata[]>([]);
	const isLoadingDrafts = ref(true);
	const pendingDraftIds = computed(
		() => new Set(pendingDraftsList.value.map((draft) => draft.id)),
	);
	const mergedDrafts = computed(() => {
		const pending = pendingDraftIds.value;
		const removed = removedDraftIds.value;
		const saved = savedDrafts.value.filter(
			(draft) => !pending.has(draft.id) && !removed.has(draft.id),
		);
		return [
			...pendingDraftsList.value.filter((draft) => !removed.has(draft.id)),
			...saved,
		].sort((a, b) => b.updatedAt - a.updatedAt);
	});

	async function refreshDrafts(showLoading = true) {
		if (showLoading) isLoadingDrafts.value = true;
		try {
			savedDrafts.value = await documents.getAllDraftMetadata();
		} catch (error) {
			console.error("[home] draft refresh failed:", error);
		} finally {
			if (showLoading) isLoadingDrafts.value = false;
		}
	}
	async function deleteDraft(id: string) {
		try {
			await documents.removeDraft(id);
			savedDrafts.value = savedDrafts.value.filter((draft) => draft.id !== id);
		} catch (error) {
			console.error("[home] draft delete failed:", error);
		}
	}
	function openDraft(id: string) {
		trackEvent(mixpanelEvents.draftOpen, { draft_id: id });
		void router.push(`${FRONTEND_ROUTES.draw}?id=${id}`, masterAnimation);
	}

	onIonViewDidEnter(() => void refreshDrafts());
	watch(
		() => pendingDraftsList.value.length,
		(length, previousLength) => {
			if (length < previousLength) void refreshDrafts(false);
		},
	);

	return {
		mergedDrafts,
		pendingDraftIds,
		isLoadingDrafts,
		openDraft,
		deleteDraft,
	};
}
