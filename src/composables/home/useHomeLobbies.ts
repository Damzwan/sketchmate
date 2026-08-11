import { onIonViewDidEnter, useIonRouter } from "@ionic/vue";
import { storeToRefs } from "pinia";
import type { Ref } from "vue";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { masterAnimation } from "@/helper/animation.helper";
import {
	refreshPublicLobbies,
	startWatchingLobbies,
} from "@/service/api/socket/drawSyncing.socket";
import { socketLoggedInPromise } from "@/service/api/socket/socket.service";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useAuthStore } from "@/store/auth.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

export function useHomeLobbies(isUnderAge: Ref<boolean>) {
	const router = useIonRouter();
	const auth = useAuthStore();
	const { publicLobbies } = storeToRefs(useDrawSyncer());

	onIonViewDidEnter(() => {
		if (isUnderAge.value) return;
		void auth.waitUntilInitialized().then(refreshPublicLobbies);
		void socketLoggedInPromise.then(startWatchingLobbies);
	});

	function joinLobby(lobbyId: string) {
		trackEvent(mixpanelEvents.lobbyOpen, {
			lobby_id: lobbyId,
			source: "home",
		});
		void router.push(
			`${FRONTEND_ROUTES.draw}?room_id=${lobbyId}`,
			masterAnimation,
		);
	}

	return { publicLobbies, joinLobby };
}
