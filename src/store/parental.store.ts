import { alertController } from "@ionic/vue";
import { defineStore, storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { presentAdultGate } from "@/helper/adultGate.helper";
import { updateUser } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import type { ParentalControls } from "@/types/server.types";

/**
 * Peer-to-peer features that let a child exchange freeform media or personal
 * information. Each one is individually switchable by an adult, and each one is
 * OFF until an adult switches it on.
 */
export type ChildFeature = "mate_add" | "mate_chat" | "mate_send" | "rooms";

const FEATURE_FLAG: Record<ChildFeature, keyof ParentalControls> = {
	mate_add: "allow_mate_add",
	mate_chat: "allow_mate_chat",
	mate_send: "allow_mate_send",
	rooms: "allow_rooms",
};

export const FEATURE_COPY: Record<
	ChildFeature,
	{ title: string; body: string; locked: string }
> = {
	mate_add: {
		title: "Add mates",
		body: "Share a personal code or scan a mate's code in person. Shares their name and profile picture.",
		locked:
			"Adding mates is switched off. A parent or guardian can turn it on in Settings → Parental Controls.",
	},
	mate_chat: {
		title: "Chat with mates",
		body: "Send and receive messages with mates already added. Free text and pictures.",
		locked:
			"Chat is switched off. A parent or guardian can turn it on in Settings → Parental Controls.",
	},
	mate_send: {
		title: "Send drawings to mates",
		body: "Send finished drawings straight to a mate's inbox.",
		locked:
			"Sending drawings to mates is switched off. A parent or guardian can turn it on in Settings → Parental Controls.",
	},
	rooms: {
		title: "Draw together with mates",
		body: "Live shared drawing rooms with mates. Everything drawn is visible to everyone in the room.",
		locked:
			"Shared drawing rooms are switched off. A parent or guardian can turn it on in Settings → Parental Controls.",
	},
};

// The safety reminder is re-shown periodically rather than once forever: the
// policy asks for a reminder before exchanging freeform media, not a one-time
// onboarding checkbox.
const SAFETY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SAFETY_LOCAL_KEY = "sm_child_safety_ack";

export const useParentalStore = defineStore("parental", () => {
	const authStore = useAuthStore();
	const { user, isUnderAge } = storeToRefs(authStore);
	const { toast } = useToast();

	/** Controls sheet visibility. Only ever opened behind the adult gate. */
	const controlsOpen = ref(false);
	const savingFeature = ref<ChildFeature | null>(null);

	const controls = computed<ParentalControls>(() => user.value?.parental ?? {});

	/** True when this account is subject to the child restrictions. */
	const isChildAccount = computed(() => isUnderAge.value);

	function isAllowed(feature: ChildFeature): boolean {
		if (!isChildAccount.value) return true;
		return controls.value[FEATURE_FLAG[feature]] === true;
	}

	const anyFeatureAllowed = computed(() =>
		(Object.keys(FEATURE_FLAG) as ChildFeature[]).some((f) => isAllowed(f)),
	);

	async function persist(patch: ParentalControls) {
		if (!user.value) return false;
		const next = { ...controls.value, ...patch };
		const previous = user.value.parental;
		user.value.parental = next;
		try {
			await updateUser({ _id: user.value._id, parental: next });
			return true;
		} catch (_e) {
			if (user.value) user.value.parental = previous;
			toast("Could not save the parental setting", { color: "danger" });
			return false;
		}
	}

	/**
	 * Adult gate → controls sheet. The gate runs on every entry, not once per
	 * session: the child is holding the same device the parent just used.
	 */
	async function openControls(): Promise<boolean> {
		const result = await presentAdultGate();
		if (result === "fail") {
			toast("That answer wasn't right — ask a parent or guardian to help.", {
				color: "warning",
			});
			return false;
		}
		if (result !== "pass") return false;

		controlsOpen.value = true;
		void persist({ reviewed_at: new Date().toISOString() });
		return true;
	}

	function closeControls() {
		controlsOpen.value = false;
	}

	/**
	 * The adult gate on entry to this sheet IS the adult action the policy asks
	 * for — a child can't reach these switches at all. Confirming each flip on
	 * top of that only taught parents to tap through dialogs, so the toggle
	 * writes straight through. Each row still states what it enables.
	 */
	async function setFeature(feature: ChildFeature, enabled: boolean) {
		if (savingFeature.value) return;
		if (isAllowed(feature) === enabled) return;

		savingFeature.value = feature;
		await persist({ [FEATURE_FLAG[feature]]: enabled });
		savingFeature.value = null;
	}

	function safetyAckIsFresh(): boolean {
		const server = controls.value.safety_ack_at;
		const stamps: number[] = [];
		if (server) stamps.push(new Date(server).getTime());
		try {
			const local = Number(localStorage.getItem(SAFETY_LOCAL_KEY) || 0);
			if (local) stamps.push(local);
		} catch {
			/* storage unavailable — fall through to the server stamp */
		}
		const last = Math.max(0, ...stamps.filter((n) => !Number.isNaN(n)));
		return last > 0 && Date.now() - last < SAFETY_TTL_MS;
	}

	function markSafetyAck() {
		const now = new Date().toISOString();
		try {
			localStorage.setItem(SAFETY_LOCAL_KEY, String(Date.now()));
		} catch {
			/* non-fatal — the server stamp is the source of truth */
		}
		void persist({ safety_ack_at: now });
	}

	/** Blocking online-safety reminder. Resolves false if it wasn't acknowledged. */
	async function presentSafetyReminder(): Promise<boolean> {
		return new Promise((resolve) => {
			alertController
				.create({
					header: "Stay safe online",
					cssClass: "liquid-alert",
					backdropDismiss: false,
					message:
						"You're about to share things with other people. Chatting and sharing online has real-world risks. " +
						"Only share with people you know in person, never share personal information (your full name, address, school, phone number or photos of yourself), " +
						"and tell a trusted adult straight away if anything feels wrong or someone makes you uncomfortable. " +
						"You can block or report anyone from their profile.",
					buttons: [{ text: "I understand", handler: () => resolve(true) }],
				})
				.then((alert) => {
					alert.onDidDismiss().then(() => resolve(false));
					void alert.present();
				});
		});
	}

	/** Explains the lock and offers the adult a way in. */
	async function presentLockedNotice(feature: ChildFeature) {
		const copy = FEATURE_COPY[feature];
		const alert = await alertController.create({
			header: "Ask a grown-up",
			cssClass: "liquid-alert",
			message: copy.locked,
			buttons: [
				{ text: "Not now", role: "cancel" },
				{ text: "I'm a parent", handler: () => void openControls() },
			],
		});
		await alert.present();
	}

	/**
	 * The single call every peer-to-peer surface makes before letting a child
	 * exchange anything:
	 *   1. adult consent for this specific feature, else a locked notice
	 *   2. an acknowledged online-safety reminder, re-shown every 30 days
	 * Returns false when the caller must not proceed.
	 */
	async function ensureCanExchange(feature: ChildFeature): Promise<boolean> {
		if (!isChildAccount.value) return true;

		if (!isAllowed(feature)) {
			await presentLockedNotice(feature);
			return false;
		}

		if (safetyAckIsFresh()) return true;

		const acknowledged = await presentSafetyReminder();
		if (!acknowledged) return false;
		markSafetyAck();
		return true;
	}

	return {
		controls,
		controlsOpen,
		savingFeature,
		isChildAccount,
		anyFeatureAllowed,
		isAllowed,
		openControls,
		closeControls,
		setFeature,
		ensureCanExchange,
	};
});
