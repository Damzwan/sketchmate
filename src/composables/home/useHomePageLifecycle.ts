import {
	onIonViewDidEnter,
	onIonViewDidLeave,
	onIonViewWillEnter,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { onBeforeUnmount, ref } from "vue";
import { isConstrainedDevice } from "@/helper/platform.helper";
import { useAuthStore } from "@/store/auth.store";
import { useCompetitionStore } from "@/store/competition.store";

type CommunityFeedHandle = { reloadIfDirty: () => void };

export function useHomePageLifecycle() {
	const { isUnderAge } = storeToRefs(useAuthStore());
	const communityFeed = ref<CommunityFeedHandle | null>(null);
	const communityFeedMounted = ref(true);
	const releaseDelay = isConstrainedDevice() ? 0 : 15_000;
	let releaseTimer: ReturnType<typeof setTimeout> | undefined;

	onIonViewDidEnter(() => {
		if (!isUnderAge.value) void useCompetitionStore().refresh();
		communityFeed.value?.reloadIfDirty();
	});
	onIonViewWillEnter(() => {
		clearTimeout(releaseTimer);
		releaseTimer = undefined;
		communityFeedMounted.value = true;
	});
	onIonViewDidLeave(() => {
		clearTimeout(releaseTimer);
		releaseTimer = setTimeout(() => {
			communityFeedMounted.value = false;
			releaseTimer = undefined;
		}, releaseDelay);
	});
	onBeforeUnmount(() => clearTimeout(releaseTimer));

	return { isUnderAge, communityFeed, communityFeedMounted };
}
