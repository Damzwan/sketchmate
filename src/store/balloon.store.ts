import { defineStore } from "pinia";
import { ref } from "vue";
import { isOldEnough } from "@/helper/general.helper";
import {
	acceptBalloon as apiAcceptBalloon,
	refuseBalloon as apiRefuseBalloon,
	fetchMyBalloons,
	triageBalloons,
} from "@/service/api/balloon.api";
import {
	socket,
	socketLoggedInPromise,
} from "@/service/api/socket/socket.service";
import { getPartialUsers } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import {
	type Balloon,
	type Mate,
	SOCKET_ENDPONTS,
	type User,
} from "@/types/server.types";
import { ToastDuration } from "@/types/toast.types";

export const useBalloonStore = defineStore("balloon", () => {
	const sentBalloon = ref<Balloon | null>(null);
	const receivedBalloon = ref<Balloon | null>(null);

	const auth = useAuthStore();
	const senderInfo = ref<Mate>();

	const { toast } = useToast();

	async function init(_user: User) {
		try {
			const { balloons } = await fetchMyBalloons();
			sentBalloon.value = balloons.length > 0 ? balloons[0] : null;
		} catch (e) {
			console.error("Failed to recover sent balloons:", e);
			sentBalloon.value = null;
		}
	}

	function setupSocketListeners() {
		if (!socket) return;

		// Deferred triage after login. We still wait on the socket-logged-in
		// promise because the server only delivers via socket emit — no
		// point asking for a balloon before the socket is ready to receive
		// `receive_new_balloon`. The actual ask is an HTTP call now.
		socketLoggedInPromise.then(() => {
			if (auth.isNewAccount) return;
			const randomDelay = Math.floor(Math.random() * (30000 - 5000 + 1) + 5000);
			setTimeout(async () => {
				if (
					!auth.user?._id ||
					auth.user.balloon?.disabled ||
					receivedBalloon.value
				)
					return;
				const oldEnough = auth.user.date_of_birth
					? isOldEnough(auth.user.date_of_birth)
					: true;
				if (!oldEnough) return;

				try {
					await triageBalloons();
				} catch (e) {
					console.error("Balloon triage failed:", e);
				}
			}, randomDelay);
		});

		// Server → client push: a balloon has arrived
		socket.on(SOCKET_ENDPONTS.receive_new_balloon_v3, async ({ balloon }) => {
			if (!balloon) return;
			try {
				const mates = await getPartialUsers([balloon.sender]);
				if (mates && mates.length > 0) {
					senderInfo.value = mates[0];
					receivedBalloon.value = balloon;
				} else {
					console.error("Sender not found");
				}
			} catch (e) {
				console.error("Failed to fetch balloon sender info", e);
			}
		});

		// Server → client push: timeout dismissal
		socket.on(SOCKET_ENDPONTS.balloon_missed, ({ balloonId }: any) => {
			if (receivedBalloon.value?._id === balloonId) {
				toast("You reacted too late, a new balloon will arrive later", {
					color: "warning",
					duration: ToastDuration.long,
				});
				receivedBalloon.value = null;
			}
		});
	}

	async function acceptReceived() {
		if (!receivedBalloon.value || !auth.user?._id) return;

		const { isUnderAge } = useAuthStore();
		if (isUnderAge) {
			refuseReceived(); // TODO test
			return;
		}

		const balloonId = receivedBalloon.value._id;
		const senderId = receivedBalloon.value.sender;

		receivedBalloon.value = null;

		try {
			await apiAcceptBalloon({ balloonId, senderId });
		} catch (e) {
			console.error("Accept balloon failed:", e);
			toast("Couldn't accept the balloon, try again", {
				color: "danger",
				duration: ToastDuration.long,
			});
		}
	}

	async function refuseReceived() {
		if (!receivedBalloon.value || !auth.user?._id) return;

		const balloonId = receivedBalloon.value._id;
		const senderId = receivedBalloon.value.sender;

		receivedBalloon.value = null;

		try {
			await apiRefuseBalloon({ balloonId, senderId });
		} catch (e) {
			console.error("Refuse balloon failed:", e);
		}
	}

	async function disableBalloons() {
		if (!receivedBalloon.value || !auth.user?._id) return;

		const balloonId = receivedBalloon.value._id;
		const senderId = receivedBalloon.value.sender;

		receivedBalloon.value = null;
		auth.user.balloon!.disabled = true;

		try {
			await apiRefuseBalloon({ balloonId, senderId, disable: true });
		} catch (e) {
			console.error("Disable balloons failed:", e);
		}
	}

	return {
		sentBalloon,
		receivedBalloon,
		init,
		acceptReceived,
		refuseReceived,
		setupSocketListeners,
		disableBalloons,
		senderInfo,
	};
});
