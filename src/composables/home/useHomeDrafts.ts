import { onIonViewDidEnter, useIonRouter } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import {
	type DrawingDraftMetadata,
	useDocumentStore,
} from "@/draw/document/document.store";
import { masterAnimation } from "@/helper/animation.helper";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useToast } from "@/service/toast.service";
import { useDraftSyncStore } from "@/store/draftSync.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

export function useHomeDrafts() {
	const router = useIonRouter();
	const documents = useDocumentStore();
	const draftSync = useDraftSyncStore();
	const subscriptions = useSubscriptionStore();
	const { pendingDraftsList, removedDraftIds } = storeToRefs(documents);
	const {
		enabled: syncEnabled,
		status: syncStatus,
		remoteListVersion,
		used: syncUsed,
		limit: syncLimit,
		remoteOnlyIds,
		remoteDraftMetadata,
		inFlightIds,
	} = storeToRefs(draftSync);
	const savedDrafts = ref<DrawingDraftMetadata[]>([]);
	const isLoadingDrafts = ref(true);
	/** Cloud-only drafts currently downloading because the user tapped them. */
	const hydratingIds = ref<Set<string>>(new Set());
	const pendingDraftIds = computed(
		() => new Set(pendingDraftsList.value.map((draft) => draft.id)),
	);
	const mergedDrafts = computed(() => {
		const pending = pendingDraftIds.value;
		const removed = removedDraftIds.value;
		// A cloud pull publishes its card metadata directly. Overlay it on the IDB
		// snapshot so Ionic's retained Home view updates in the same tick instead of
		// waiting for the next `ionViewDidEnter` refresh.
		const available = new Map(
			savedDrafts.value.map((draft) => [draft.id, draft]),
		);
		for (const [id, draft] of remoteDraftMetadata.value) {
			available.set(id, draft);
		}
		const saved = [...available.values()].filter(
			(draft) => !pending.has(draft.id) && !removed.has(draft.id),
		);
		return [
			...pendingDraftsList.value.filter((draft) => !removed.has(draft.id)),
			...saved,
		].sort((a, b) => b.updatedAt - a.updatedAt);
	});

	/**
	 * Per-card cloud state for the badge. Only meaningful for Pro; free accounts
	 * get a single section-level hint instead of a badge on every card.
	 */
	const draftSyncStates = computed<Record<string, string>>(() => {
		if (!syncEnabled.value) return {};
		const states: Record<string, string> = {};
		for (const draft of mergedDrafts.value) {
			if (hydratingIds.value.has(draft.id)) states[draft.id] = "downloading";
			else if (remoteOnlyIds.value.has(draft.id)) states[draft.id] = "cloud";
			else if (inFlightIds.value.has(draft.id)) states[draft.id] = "uploading";
			else states[draft.id] = "synced";
		}
		return states;
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

	function markHydrating(id: string, active: boolean) {
		if (active) hydratingIds.value.add(id);
		else hydratingIds.value.delete(id);
		hydratingIds.value = new Set(hydratingIds.value);
	}

	async function openDraft(id: string) {
		trackEvent(mixpanelEvents.draftOpen, { draft_id: id });

		// A draft whose newest revision only exists in the cloud has a card but no
		// document on this device. Downloading first is what makes the card honest
		// — navigating straight in would open an empty canvas and, worse, autosave
		// that emptiness over the real drawing.
		if (remoteOnlyIds.value.has(id)) {
			markHydrating(id, true);
			try {
				const ready = await draftSync.ensureLocalCopy(id);
				if (!ready) {
					useToast().toast(
						"This draft hasn't downloaded yet. Reconnect and try again.",
						{ color: "warning" },
					);
					return;
				}
				await refreshDrafts(false);
			} finally {
				markHydrating(id, false);
			}
		}

		void router.push(`${FRONTEND_ROUTES.draw}?id=${id}`, masterAnimation);
	}

	/**
	 * One sheet serves both tiers: for Pro it's the legend that makes the cloud
	 * badges readable, for everyone else it's the same legend plus the pitch.
	 * Keeping it a single surface is what lets the home screen carry only a chip.
	 */
	const isSyncSheetOpen = ref(false);
	// Once loaded, keep the Ionic modal mounted. Unmounting on the first close
	// event skips its dismiss transition and makes the sheet disappear instantly.
	const isSyncSheetLoaded = ref(false);

	function openSyncSheet() {
		if (!syncEnabled.value) {
			trackEvent(mixpanelEvents.presentPaywall, { source: "draft_sync" });
		}
		isSyncSheetLoaded.value = true;
		isSyncSheetOpen.value = true;
	}

	function closeSyncSheet() {
		isSyncSheetOpen.value = false;
	}

	function upgradeForSync() {
		isSyncSheetOpen.value = false;
		subscriptions.openPaywall();
	}

	const isCheckingForUpdates = ref(false);

	async function checkForUpdates() {
		if (isCheckingForUpdates.value || !syncEnabled.value) return;
		isCheckingForUpdates.value = true;
		try {
			// Bypass the normal one-minute pull throttle, but do not force uploads or
			// retry locally blocked drafts. This control only asks the cloud whether
			// another device has produced a newer revision.
			await draftSync.pull(true);
			await refreshDrafts(false);
		} finally {
			isCheckingForUpdates.value = false;
		}
	}

	async function resyncDraft(id: string) {
		const result = await draftSync.resyncDraft(id);
		await refreshDrafts(false);
		const { toast } = useToast();
		switch (result) {
			case "synced":
				toast("Draft backup refreshed", { color: "success" });
				break;
			case "downloaded":
				toast("Latest cloud version downloaded", { color: "success" });
				break;
			case "offline":
				toast("Reconnect to sync this draft", { color: "warning" });
				break;
			case "missing":
				toast("This draft is no longer on this device", { color: "warning" });
				break;
			default:
				toast("Could not sync this draft yet", { color: "warning" });
		}
	}

	/**
	 * Dev-only draft wipe. Guarded twice — the caller only renders the control
	 * under `import.meta.env.DEV`, and this refuses outright in a production
	 * build so a stray call cannot destroy a real user's work.
	 */
	async function wipeAllDrafts() {
		if (!import.meta.env.DEV) return;
		const { toast } = useToast();
		try {
			const ids = await documents.removeAllDrafts();
			savedDrafts.value = [];
			// Local-only: the cloud copies are deliberately left alone so this stays
			// a way to test the DOWNLOAD path rather than a way to lose test data.
			toast(`Wiped ${ids.length} local draft(s)`, { color: "warning" });
			isSyncSheetOpen.value = false;
		} catch (error) {
			console.error("[home] draft wipe failed:", error);
			toast("Could not wipe drafts", { color: "danger" });
		}
	}

	onIonViewDidEnter(() => {
		void refreshDrafts();
		// Throttled inside the store, so returning to Home repeatedly is one call.
		void draftSync.pull();
	});
	watch(
		() => pendingDraftsList.value.length,
		(length, previousLength) => {
			if (length < previousLength) void refreshDrafts(false);
		},
	);
	// Re-read after every completed pull. Watching only `remoteOnlyIds.size`
	// misses replacements, newer revisions of an existing remote card, and a
	// delete plus add whose net count is unchanged.
	watch(remoteListVersion, () => {
		// The button path awaits its own refresh so the spinner covers the UI update.
		if (!isCheckingForUpdates.value) void refreshDrafts(false);
	});

	return {
		mergedDrafts,
		pendingDraftIds,
		isLoadingDrafts,
		draftSyncStates,
		syncEnabled,
		syncStatus,
		syncUsed,
		syncLimit,
		isSyncSheetOpen,
		isSyncSheetLoaded,
		isCheckingForUpdates,
		openDraft,
		deleteDraft,
		openSyncSheet,
		closeSyncSheet,
		upgradeForSync,
		checkForUpdates,
		resyncDraft,
		wipeAllDrafts,
	};
}
