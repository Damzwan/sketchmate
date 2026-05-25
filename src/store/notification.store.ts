// store/notification.store.ts
import { defineStore, storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { Preferences } from "@capacitor/preferences";
import { Device } from "@capacitor/device";
import { PushNotifications } from "@capacitor/push-notifications";
import { NotificationSubscription, User } from "@/types/server.types";
import { LocalStorage } from "@/types/storage.types";
import { generateDeviceFingerprint, isNative } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { disableNotifications } from "@/helper/notification.helper";
import { subscribe, unsubscribe } from "@/service/api/user.api";

export const useNotificationStore = defineStore("notification", () => {
	const localSubscription = ref<string | undefined>(undefined);
	const notificationsAllowed = ref(false);
	const showEnableNotificationsAfterLogin = ref(false);

	// Serialize all mutations to prevent interleaved subscribe/unsubscribe calls.
	let mutationQueue: Promise<unknown> = Promise.resolve();
	const runExclusive = <T>(fn: () => Promise<T>): Promise<T> => {
		const next = mutationQueue.then(fn, fn);
		// Swallow errors on the queue itself so one failure doesn't poison subsequent calls.
		mutationQueue = next.catch(() => {});
		return next;
	};

	const deviceNotificationsAllowed = computed(() => {
		const auth = useAuthStore();
		const fp = auth.deviceFingerprint;
		const user = auth.user;

		// The truth is: do we have a local token AND does the server know about it for this device?
		if (!localSubscription.value || !fp || !user) return false;

		const serverSub = user.subscriptions?.find((s) => s.fingerprint === fp);
		return (
			notificationsAllowed.value &&
			!!serverSub &&
			serverSub.token === localSubscription.value
		);
	});

	/**
	 * Persists token locally and syncs with the server. Idempotent and safe to
	 * call repeatedly — if the token is unchanged AND the server already has it,
	 * this is a no-op. If the server is out of sync (token rotation, missed
	 * subscribe), this reconciles silently.
	 */
	async function setNotifications(token: string | undefined): Promise<void> {
		return runExclusive(async () => {
			const authStore = useAuthStore();
			const { user } = storeToRefs(authStore);
			if (!user.value?._id) return;

			const fingerprint = await generateDeviceFingerprint();
			const existingServerSub = user.value.subscriptions?.find(
				(s) => s.fingerprint === fingerprint,
			);

			// ── Unsubscribe path ──────────────────────────────────────────────
			if (!token) {
				const previousLocal = localSubscription.value;
				const previousSubs = user.value.subscriptions ?? [];

				// Optimistic update
				localSubscription.value = undefined;
				await Preferences.remove({ key: LocalStorage.notificationToken });
				user.value.subscriptions = previousSubs.filter(
					(s) => s.fingerprint !== fingerprint,
				);

				try {
					await unsubscribe({ user_id: user.value._id, fingerprint });
				} catch (e) {
					// Roll back so UI reflects reality
					localSubscription.value = previousLocal;
					if (previousLocal) {
						await Preferences.set({
							key: LocalStorage.notificationToken,
							value: previousLocal,
						});
					}
					user.value.subscriptions = previousSubs;
					throw e;
				}
				return;
			}

			// ── Subscribe / update path ───────────────────────────────────────
			// Skip if everything is already in sync.
			const alreadySynced =
				localSubscription.value === token && existingServerSub?.token === token;
			if (alreadySynced) return;

			const deviceInfo = await Device.getInfo();
			const newSub: NotificationSubscription = {
				token,
				fingerprint,
				model: deviceInfo.model,
				platform: deviceInfo.platform,
				os: deviceInfo.operatingSystem,
				logged_in: true,
				updated_at: new Date().toISOString(),
			};

			const previousLocal = localSubscription.value;
			const previousSubs = user.value.subscriptions ?? [];

			// Optimistic update — replace existing entry for this fingerprint, no duplicates
			localSubscription.value = token;
			await Preferences.set({
				key: LocalStorage.notificationToken,
				value: token,
			});
			user.value.subscriptions = [
				...previousSubs.filter((s) => s.fingerprint !== fingerprint),
				newSub,
			];

			try {
				await subscribe({ user_id: user.value._id, subscription: newSub });
			} catch (e) {
				// Roll back
				localSubscription.value = previousLocal;
				if (previousLocal) {
					await Preferences.set({
						key: LocalStorage.notificationToken,
						value: previousLocal,
					});
				} else {
					await Preferences.remove({ key: LocalStorage.notificationToken });
				}
				user.value.subscriptions = previousSubs;
				throw e;
			}
		});
	}

	/**
	 * Called on app start / login. Reconciles three sources of truth:
	 *   1. OS permission state
	 *   2. The locally cached token (Preferences)
	 *   3. The server's stored subscription for this device
	 *
	 * Token rotation is handled silently: if the OS reports a different token
	 * than the server knows about, we re-subscribe in the background.
	 */
	async function init(user: User, arrivedFromLogin = false): Promise<void> {
		const fingerprint = await generateDeviceFingerprint();

		// 1. Load any cached token from previous sessions
		const stored = await Preferences.get({
			key: LocalStorage.notificationToken,
		});
		localSubscription.value = stored.value ?? undefined;

		// 2. Check OS permission
		let permissionStatus: string;
		if (isNative()) {
			const res = await PushNotifications.checkPermissions();
			permissionStatus = res.receive;
		} else if (typeof Notification !== "undefined") {
			permissionStatus = Notification.permission;
		} else {
			permissionStatus = "denied";
		}
		const hasPermission = permissionStatus === "granted";

		// 3. Reconcile
		const serverSub = user?.subscriptions?.find(
			(s) => s.fingerprint === fingerprint,
		);

		if (!hasPermission) {
			// OS revoked permission — clean up everything
			if (serverSub || localSubscription.value) {
				await disableNotifications();
			}
			notificationsAllowed.value = false;
		} else if (
			localSubscription.value &&
			(!serverSub || serverSub.token !== localSubscription.value)
		) {
			// We have permission and a local token, but the server is stale or out of sync.
			// Silently reconcile.
			try {
				await setNotifications(localSubscription.value);
				notificationsAllowed.value = true;
			} catch {
				notificationsAllowed.value = !!serverSub;
			}
		} else {
			notificationsAllowed.value = !!serverSub && !!localSubscription.value;
		}

		if (arrivedFromLogin) {
			showEnableNotificationsAfterLogin.value = !notificationsAllowed.value;
		}
	}

	/** Call this from your PushNotifications.addListener('registration', ...) handler */
	async function handleTokenRefresh(token: string): Promise<void> {
		try {
			await setNotifications(token);
			notificationsAllowed.value = true;
		} catch (e) {
			console.error("Failed to sync rotated push token", e);
		}
	}

	return {
		localSubscription,
		notificationsAllowed,
		showEnableNotificationsAfterLogin,
		deviceNotificationsAllowed,

		setNotifications,
		init,
		handleTokenRefresh,
	};
});
