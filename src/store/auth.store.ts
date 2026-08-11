import { Preferences } from "@capacitor/preferences";
import {
	FirebaseAuthentication,
	type User as FirebaseUser,
} from "@capacitor-firebase/authentication";
import type { UseIonRouterResult } from "@ionic/vue";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { masterAnimation, routerAnimation } from "@/helper/animation.helper";
import {
	getCurrentAuthUser,
	hasDurableSignInProvider,
} from "@/helper/firebase.helper";
import {
	compareVersions,
	generateDeviceFingerprint,
	isOldEnough,
} from "@/helper/general.helper";
import { isNative } from "@/helper/platform.helper";
import router from "@/router";
import { refreshPublicLobbies } from "@/service/api/socket/drawSyncing.socket";
import {
	socketConnect,
	socketDisconnect,
	socketLogin,
} from "@/service/api/socket/socket.service";
import {
	getUser,
	onLoginEvent,
	updateUserTimezone,
} from "@/service/api/user.api";
import {
	ensureGuestRecovery,
	finalizeGuestRecovery,
} from "@/service/guestRecovery.service";
import {
	mixpanelEvents,
	mixpanelIdentify,
	trackEvent,
} from "@/service/mixpanel";
import { useToast } from "@/service/toast.service";
import { useBalloonStore } from "@/store/balloon.store";
import { useChatStore } from "@/store/chat.store";
import { useDateOfBirthModalStore } from "@/store/dateOfBirth.store";
import { useFriendStore } from "@/store/friend.store";
import { useInAppNotificationStore } from "@/store/inAppNotificationStore";
import { useInboxStore } from "@/store/inbox.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useModerationStore } from "@/store/moderation.store";
import { useNotificationStore } from "@/store/notification.store";
import { useQuotaStore } from "@/store/quota.store";
import { resetAllStores } from "@/store/resetStores";
import { useSessionStore } from "@/store/session.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { FRONTEND_ROUTES } from "@/types/router.types";
import type { User } from "@/types/server.types";
import { LocalStorage } from "@/types/storage.types";

export const useAuthStore = defineStore("auth", () => {
	// --- STATE ---
	const user = ref<User>();
	const firebaseUser = ref<FirebaseUser>();

	const isLoggedIn = ref(false);
	const isAuthLoading = ref(true);
	const isNewAccount = ref(false);
	const showForceUpdateModal = ref(false);
	const showTutorial = ref(false);
	const isRecoveredGuestAccount = ref(false);
	const deviceFingerprint = ref<string>();
	const localUserImg = ref<string>();

	const lastHydratedAt = ref<number>(0);
	const isHydrating = ref(false);

	const minimum_online_version = ref<string>("");

	let ionRouter: UseIonRouterResult | undefined;

	// --- DERIVED ---
	const hasConfirmedAge = computed(() => !!user.value?.date_of_birth);
	const isGuestAccount = computed(
		() => !!firebaseUser.value?.isAnonymous || isRecoveredGuestAccount.value,
	);
	// Default-DENY: an account whose age we haven't confirmed is treated as a
	// child account until it tells us otherwise. Anything else leaves a window
	// (guest sign-in, a failed DOB save, a legacy row) where social features are
	// wide open on a possibly-under-13 account — exactly what the Families
	// policy forbids. `hasConfirmedAge` is what UI should use to phrase copy.
	const isUnderAge = computed(() => {
		if (!user.value) return false;
		if (!user.value.date_of_birth) return true;
		return !isOldEnough(user.value.date_of_birth);
	});

	// --- INIT ---
	Preferences.get({ key: LocalStorage.img }).then(
		(res) => (localUserImg.value = res.value!),
	);

	watch(
		() => user.value?.img,
		(img) => {
			if (!img || img === localUserImg.value) return;
			localUserImg.value = img;
			Preferences.set({ key: LocalStorage.img, value: img });
		},
	);

	generateDeviceFingerprint().then(
		(fingerprint) => (deviceFingerprint.value = fingerprint),
	);

	// --- AUTH STATE LISTENER ---
	FirebaseAuthentication.addListener("authStateChange", async (status) => {
		if (!ionRouter) throw new Error("IonRouter not initialized");

		if (!status.user) {
			await router.isReady();
			isLoggedIn.value = false;
			user.value = undefined;
			firebaseUser.value = undefined;
			isAuthLoading.value = false;

			const currentPath = router.currentRoute.value.path;
			const isDevBenchmark = import.meta.env.DEV && currentPath === "/bench";
			if (currentPath !== `/${FRONTEND_ROUTES.login}` && !isDevBenchmark) {
				ionRouter.replace(FRONTEND_ROUTES.login, masterAnimation);
			}
			return;
		}

		firebaseUser.value = status.user;
		const [recoveredSession, legacyRecoveryLink] = await Promise.all([
			Preferences.get({ key: LocalStorage.recoveredGuestSession }),
			Preferences.get({ key: LocalStorage.guestRecoveryLinkRequired }),
		]);
		const alreadyLinked = hasDurableSignInProvider(status.user);
		const providerlessRecoveredGuest =
			!status.user.isAnonymous && !alreadyLinked;
		const recoverySessionMatches = recoveredSession.value === status.user.uid;
		const legacyRecoverySession =
			!alreadyLinked &&
			(recoveredSession.value === "true" ||
				legacyRecoveryLink.value === "true");
		const recoverySessionActive =
			recoverySessionMatches ||
			legacyRecoverySession ||
			providerlessRecoveredGuest;
		isRecoveredGuestAccount.value = recoverySessionActive && !alreadyLinked;
		if (
			isRecoveredGuestAccount.value &&
			recoveredSession.value !== status.user.uid
		) {
			await Preferences.set({
				key: LocalStorage.recoveredGuestSession,
				value: status.user.uid,
			});
		}
		if (
			legacyRecoveryLink.value === "true" ||
			recoveredSession.value === "true"
		) {
			await Preferences.remove({ key: LocalStorage.guestRecoveryLinkRequired });
		}
		if (recoverySessionMatches && alreadyLinked) {
			await Preferences.remove({ key: LocalStorage.recoveredGuestSession });
			isRecoveredGuestAccount.value = false;
			void finalizeGuestRecovery();
		}

		const justLoggedIn = await Preferences.get({ key: LocalStorage.login });
		const arrivedFromLogin = !!justLoggedIn.value;

		// BOOTSTRAP: blocking, fast — just enough to make routing decisions
		const ok = await bootstrap();

		if (isNative() && user.value)
			void Purchases.logIn({ appUserID: user.value.auth_id });

		if (!ok) {
			const { toast } = useToast();
			if (arrivedFromLogin) {
				toast("Something went wrong, please try again", { color: "warning" });
			} else {
				toast(
					"You're offline. Local drawing is still available. Reopen the app to retry.",
					{ color: "warning" },
				);
				ionRouter.replace(FRONTEND_ROUTES.home, routerAnimation);
			}
			isAuthLoading.value = false;
			return;
		}

		// Splash can come down NOW — user is loaded, route is decided.
		isAuthLoading.value = false;

		// HYDRATE in two stages:
		//   - hydrateCritical: things routing depends on. Awaited.
		//   - hydrateBackground: everything else. Fire-and-forget, stores own their loading UI.
		await hydrateCritical({ arrivedFromLogin });
		void hydrateBackground({ arrivedFromLogin });

		// ROUTING + post-login prompts
		await handlePostBootstrapRouting(arrivedFromLogin);
	});

	/**
	 * Decides where to send the user after bootstrap succeeds.
	 *
	 * Priority order:
	 *   1. New account → onboarding flow owns navigation (AgeConfirmationPage handles DOB)
	 *   2. Legacy user missing DOB → show universal DOB modal (blocking, no skip)
	 *   3. Arrived from login + notifications not yet activated → push notification opt-in page
	 *   4. Redirect intent from a deep link → honor it
	 *   5. Otherwise → home (or whatever route they were on)
	 */
	async function handlePostBootstrapRouting(arrivedFromLogin: boolean) {
		if (!ionRouter || !user.value) return;

		// 1. New signup — onboarding flow drives the stack, nothing to do here
		if (arrivedFromLogin && isNewAccount.value) {
			Preferences.remove({ key: LocalStorage.login });
			return;
		}

		// 2. Legacy user without DOB — prompt them. Blocking by design.
		//    The modal saves to user.date_of_birth on confirm, so isUnderAge
		//    becomes correct before we route anywhere.
		if (!user.value.date_of_birth) {
			const dobStore = useDateOfBirthModalStore();
			await dobStore.open("initial");
			// Don't branch on result. Soft mode means even if they declined,
			// home + server-side gates handle the rest. Continue routing.
		}

		// 3. Post-login notification opt-in for users who haven't activated yet
		const { showEnableNotificationsAfterLogin } = useNotificationStore();
		if (arrivedFromLogin && showEnableNotificationsAfterLogin) {
			return;
		}

		// 4. Deep-link redirect intent (e.g. opened from a push notification)
		const { redirectIntent } = useSessionStore();
		if (redirectIntent) {
			ionRouter.replace(redirectIntent, routerAnimation);
			if (arrivedFromLogin) Preferences.remove({ key: LocalStorage.login });
			return;
		}

		// 5. Default routing
		if (arrivedFromLogin) {
			ionRouter.replace(FRONTEND_ROUTES.home, routerAnimation);
			Preferences.remove({ key: LocalStorage.login });
		} else {
			const allowedRoutes = Object.values(FRONTEND_ROUTES).filter(
				(p) => p !== FRONTEND_ROUTES.login,
			) as Partial<FRONTEND_ROUTES>[];
			const path = router.currentRoute.value.path.split("/")[1];
			if (allowedRoutes.includes(path as FRONTEND_ROUTES)) {
				ionRouter.replace(path, routerAnimation);
			} else {
				ionRouter.replace(FRONTEND_ROUTES.home, routerAnimation);
			}
		}
	}

	/**
	 * BOOTSTRAP: minimum work to make a routing decision.
	 */
	async function bootstrap(): Promise<boolean> {
		try {
			void socketConnect();

			const authUser = await getCurrentAuthUser();
			if (!authUser) return false;

			const userValue = await getUser({ auth_id: authUser.uid });
			if (!userValue) return false;

			minimum_online_version.value = userValue.minimum_online_version;

			if (
				isNative() &&
				compareVersions(
					__APP_VERSION__,
					userValue.minimum_supported_version,
				) === -1
			) {
				showForceUpdateModal.value = true;
				return false;
			}

			showTutorial.value = !userValue.user.last_seen_version;
			user.value = userValue.user;
			isNewAccount.value = userValue.new_account;
			isLoggedIn.value = true;

			void socketLogin({ _id: user.value._id });

			// Draft mirror reconciliation reads user_id to keep device backups scoped
			// to the correct account. Commit it before routing can mount the home draft
			// list; otherwise a cold login can permanently skip this boot's recovery.
			await Promise.all([
				Preferences.set({ key: LocalStorage.user_id, value: user.value._id }),
				Preferences.set({ key: LocalStorage.img, value: user.value.img }),
				Preferences.remove({ key: LocalStorage.loggedOut }),
			]);

			if (authUser.isAnonymous || isRecoveredGuestAccount.value) {
				void ensureGuestRecovery({
					guestUid: authUser.uid,
					profileName: user.value.name,
					profileImage: user.value.img,
				}).catch((error) =>
					console.warn("Could not provision guest recovery:", error),
				);
			}

			return true;
		} catch (e) {
			console.error("[auth] bootstrap failed:", e);
			return false;
		}
	}

	/**
	 * CRITICAL HYDRATION: awaited before routing decisions.
	 *
	 * Only what `handlePostBootstrapRouting` reads goes here. Right now that's
	 * the notification store, because the "send them to LoginNotificationPage"
	 * branch reads `showEnableNotificationsAfterLogin` immediately after.
	 *
	 * Keep this list tight — anything added here delays the home screen.
	 */
	async function hydrateCritical(opts: { arrivedFromLogin: boolean }) {
		if (!user.value) return;
		try {
			await useNotificationStore().init(user.value, opts.arrivedFromLogin);
		} catch (e) {
			console.error("[auth] critical hydrate failed:", e);
			// Don't block routing on this — worst case is we skip the notification
			// opt-in prompt for this session and they see it next time.
		}
	}

	/**
	 * BACKGROUND HYDRATION: fire-and-forget, in parallel.
	 *
	 * Everything routing doesn't directly read. Each store handles its own
	 * loading state; failures are isolated via Promise.allSettled.
	 */
	async function hydrateBackground(opts: { arrivedFromLogin: boolean }) {
		if (!user.value) return;
		isHydrating.value = true;

		const u = user.value;

		try {
			await Promise.allSettled([
				useSubscriptionStore().checkProStatus(),
				useBalloonStore().init(u),
				useFriendStore().initializeSocialGraph(),
				useQuotaStore().refresh(true),
				useChatStore().loadActiveChats(),
				useModerationStore().initFromUser(u),
				useInAppNotificationStore().loadInitial(),
				refreshPublicLobbies(),
				useInventoryStore().hydrateFromUser(user.value),
				syncCurrentTimezone(),
			]);

			if (opts.arrivedFromLogin) {
				// Await the fingerprint instead of reading the ref. It's populated by
				// a floating promise started at store creation, so on a cold start it
				// was routinely still undefined here — the call was skipped, and a
				// device that had been marked logged_in:false by a previous logout
				// stayed that way server-side. sendToTokens filters on that flag, so
				// the user got no pushes at all until something else happened to
				// re-subscribe them.
				const fingerprint =
					deviceFingerprint.value ?? (await generateDeviceFingerprint());
				deviceFingerprint.value = fingerprint;

				await onLoginEvent({
					user_id: u._id,
					fingerprint,
					loggedIn: true,
				}).catch((err) =>
					console.warn("Failed to mark device logged-in for push", err),
				);
			}

			lastHydratedAt.value = Date.now();
		} finally {
			isHydrating.value = false;

			await mixpanelIdentify(u._id);

			// Signup fires alongside — not instead of — login, so the login series
			// stays continuous and `create_account` marks day zero of the funnel.
			// Guarded on `arrivedFromLogin` as well as `isNewAccount`: the flag
			// survives on the store for the whole session, and a re-hydrate
			// (refresh, resume) must not re-fire it.
			if (opts.arrivedFromLogin && isNewAccount.value) {
				void trackEvent(mixpanelEvents.createAccount, {
					provider: firebaseUser.value?.providerId ?? "unknown",
				});
			}

			void trackEvent(mixpanelEvents.login);
		}
	}

	/**
	 * REFRESH: re-fetch user + re-hydrate everything that could be stale.
	 */
	async function refresh(e?: any): Promise<void> {
		const { toast } = useToast();

		try {
			const authUser = await getCurrentAuthUser();
			if (!authUser) {
				toast("Something went wrong, please try again.", { color: "danger" });
				return;
			}
			const userValue = await getUser({ auth_id: authUser.uid });
			if (!userValue) {
				toast("Something went wrong, please try again.", { color: "danger" });
				return;
			}
			user.value = userValue.user;

			await Promise.allSettled([
				useInboxStore().getInboxBatch(true),
				useChatStore().loadActiveChats(),
				useQuotaStore().refresh(true),
				useModerationStore().initFromUser(user.value),
				useInAppNotificationStore().loadInitial(),
				refreshPublicLobbies(),
				useInventoryStore().hydrateFromUser(user.value),
				syncCurrentTimezone(),
			]);

			lastHydratedAt.value = Date.now();
		} catch (err) {
			console.error("[auth] refresh failed:", err);
			toast("Couldn't refresh, try again.", { color: "danger" });
		} finally {
			if (e) e.target.complete();
		}
	}

	async function syncCurrentTimezone(): Promise<void> {
		if (!user.value) return;

		let timezone: string;
		try {
			timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch {
			return;
		}

		if (!timezone || timezone === user.value.timezone) return;

		try {
			const response = await updateUserTimezone(timezone);
			if (user.value) user.value.timezone = response.timezone;
		} catch (e) {
			console.warn("[auth] timezone sync failed", e);
		}
	}

	function initIonRouter(r: UseIonRouterResult) {
		ionRouter = r;
	}

	async function logout() {
		if (isGuestAccount.value && firebaseUser.value && user.value) {
			// Bootstrap normally provisions this already. Awaiting it here closes the
			// small first-session race where someone signs out before the background
			// enrollment has written the device recovery record. The timeout ensures
			// recovery service trouble can never prevent or stall logout for long.
			let recoveryTimeout: ReturnType<typeof setTimeout> | undefined;
			const timeout = new Promise<never>((_, reject) => {
				recoveryTimeout = setTimeout(
					() => reject(new Error("Guest recovery enrollment timed out")),
					2000,
				);
			});
			await Promise.race([
				ensureGuestRecovery({
					guestUid: firebaseUser.value.uid,
					profileName: user.value.name,
					profileImage: user.value.img,
				}),
				timeout,
			])
				.catch((error) => {
					console.warn(
						"Could not prepare guest recovery before logout:",
						error,
					);
					useToast().toast(
						"Recovery could not be confirmed, but you can still log out. Local drafts remain on this device.",
						{ color: "warning" },
					);
				})
				.finally(() => clearTimeout(recoveryTimeout));
		}

		Preferences.remove({ key: LocalStorage.user_id });
		Preferences.remove({ key: LocalStorage.recoveredGuestSession });
		Preferences.remove({ key: LocalStorage.guestRecoveryLinkRequired });
		// Tells the Android widget this is a real sign-out, not a cold start it
		// happened to beat — it drops its cached drawing on seeing this.
		Preferences.set({ key: LocalStorage.loggedOut, value: "1" });

		// Deactivate this device's push server-side BEFORE signing out, so the
		// authenticated request actually lands (previously it raced signOut()).
		if (user.value) {
			// Same reason as in hydrateBackground: don't drop the call just because
			// the fingerprint promise hasn't resolved yet.
			const fingerprint =
				deviceFingerprint.value ?? (await generateDeviceFingerprint());
			deviceFingerprint.value = fingerprint;

			await onLoginEvent({
				user_id: user.value._id,
				fingerprint,
				loggedIn: false,
			}).catch((err) =>
				console.warn("Failed to mark device logged-out for push", err),
			);
		}

		socketDisconnect();

		if (ionRouter) {
			ionRouter.navigate(FRONTEND_ROUTES.login, "root", "replace");
		}

		await FirebaseAuthentication.signOut();

		// Every instantiated store, this one included. Runs last so the calls
		// above still see `user.value`. Previously 8 of 22 stores were reset by
		// hand here and the rest carried the old account into the next login.
		resetAllStores();
	}

	async function completeGuestRecoveryLink(): Promise<void> {
		isRecoveredGuestAccount.value = false;
		await Promise.all([
			Preferences.remove({ key: LocalStorage.recoveredGuestSession }),
			Preferences.remove({ key: LocalStorage.guestRecoveryLinkRequired }),
		]);
	}

	async function waitUntilInitialized(): Promise<User | undefined> {
		if (!isAuthLoading.value) return user.value;

		return new Promise((resolve) => {
			// The bail-out timer must be cleared on the fast path. Every caller
			// (each route entry, each socket reconnect) otherwise leaves a 10 s
			// timer holding this closure — and `user` with it — alive.
			let timer: ReturnType<typeof setTimeout> | undefined;

			const unwatch = watch(
				isAuthLoading,
				(loading) => {
					if (loading) return;
					unwatch();
					clearTimeout(timer);
					resolve(user.value);
				},
				{ immediate: true },
			);

			timer = setTimeout(() => {
				unwatch();
				resolve(undefined);
			}, 10000);
		});
	}

	/**
	 * Account-scoped state only. `deviceFingerprint`, `localUserImg` and
	 * `minimum_online_version` identify the install or the build, not the user,
	 * and re-deriving them costs a round trip on the next login for no gain.
	 */
	function resetRuntimeState() {
		user.value = undefined;
		firebaseUser.value = undefined;
		isLoggedIn.value = false;
		isNewAccount.value = false;
		isRecoveredGuestAccount.value = false;
		showTutorial.value = false;
		lastHydratedAt.value = 0;
		isHydrating.value = false;
	}

	function onlineUpdateRequired() {
		return (
			compareVersions(__APP_VERSION__, minimum_online_version.value) === -1
		);
	}

	return {
		user,
		firebaseUser,
		isLoggedIn,
		isAuthLoading,
		isNewAccount,
		isRecoveredGuestAccount,
		isGuestAccount,
		isHydrating,
		lastHydratedAt,
		showForceUpdateModal,
		showTutorial,
		hasConfirmedAge,
		isUnderAge,
		deviceFingerprint,
		localUserImg,
		initIonRouter,
		bootstrap,
		hydrateCritical,
		hydrateBackground,
		logout,
		completeGuestRecoveryLink,
		refresh,
		waitUntilInitialized,
		onlineUpdateRequired,
		resetRuntimeState,
	};
});
