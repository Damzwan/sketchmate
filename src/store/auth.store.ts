import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { FirebaseAuthentication, User as FirebaseUser } from '@capacitor-firebase/authentication'
import { UseIonRouterResult } from '@ionic/vue'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'

import { User } from '@/types/server.types'
import { LocalStorage } from '@/types/storage.types'
import { useToast } from '@/service/toast.service'

import {
	compareVersions,
	generateDeviceFingerprint,
	getCurrentAuthUser,
	isNative,
	isOldEnough
} from '@/helper/general.helper'
import { masterAnimation, routerAnimation } from '@/helper/animation.helper'
import { useNotificationStore } from '@/store/notification.store'
import { useBalloonStore } from '@/store/balloon.store'
import { useInboxStore } from '@/store/inbox.store'
import { socketConnect, socketDisconnect, socketLogin } from '@/service/api/socket/socket.service'
import { useSessionStore } from '@/store/session.store'
import { mixpanelIdentify } from '@/service/mixpanel'
import { useFriendStore } from '@/store/friend.store'
import { useChatStore } from '@/store/chat.store'
import { useModerationStore } from '@/store/moderation.store'
import { getUser, onLoginEvent } from '@/service/api/user.api'
import { useQuotaStore } from '@/store/quota.store'
import { useInAppNotificationStore } from '@/store/inAppNotificationStore'
import { refreshPublicLobbies } from '@/service/api/socket/drawSyncing.socket'
import { useDateOfBirthModalStore } from '@/store/dateOfBirth.store'
import { useInventoryStore } from '@/store/inventory.store'
import { useSubscriptionStore } from '@/store/subscription.store'
import { Purchases } from '@revenuecat/purchases-capacitor'

export const useAuthStore = defineStore("auth", () => {
	// --- STATE ---
	const user = ref<User>();
	const firebaseUser = ref<FirebaseUser>();

	const isLoggedIn = ref(false);
	const isAuthLoading = ref(true);
	const isNewAccount = ref(false);
	const showForceUpdateModal = ref(false);
	const showTutorial = ref(false);
	const deviceFingerprint = ref<string>();
	const localUserImg = ref<string>();

	const lastHydratedAt = ref<number>(0);
	const isHydrating = ref(false);

	const minimum_online_version = ref<string>("");

	let ionRouter: UseIonRouterResult | undefined = undefined;

	// --- DERIVED ---
	const hasConfirmedAge = computed(() => !!user.value?.date_of_birth);
	const isUnderAge = computed(() => {
		if (!user.value?.date_of_birth) return false;
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
			if (currentPath !== `/${FRONTEND_ROUTES.login}`) {
				ionRouter.replace(FRONTEND_ROUTES.login, masterAnimation);
			}
			return;
		}

		firebaseUser.value = status.user;

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

			Preferences.set({ key: LocalStorage.user_id, value: user.value._id });
			Preferences.set({ key: LocalStorage.img, value: user.value.img });
			mixpanelIdentify(user.value._id);

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
			]);

			if (opts.arrivedFromLogin && deviceFingerprint.value) {
				onLoginEvent({
					user_id: u._id,
					fingerprint: deviceFingerprint.value,
					loggedIn: true,
				});
			}

			// Engagement titles + the OG founder gift are granted server-side by the
			// v1 migration (see migrationGrants in the server helper) and arrive in
			// the hydrated user.inventory — no client re-check needed.

			lastHydratedAt.value = Date.now();
		} finally {
			isHydrating.value = false;
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
			]);

			lastHydratedAt.value = Date.now();
		} catch (err) {
			console.error("[auth] refresh failed:", err);
			toast("Couldn't refresh, try again.", { color: "danger" });
		} finally {
			if (e) e.target.complete();
		}
	}

	function initIonRouter(r: UseIonRouterResult) {
		ionRouter = r;
	}

	async function logout() {
		const { showEnableNotificationsAfterLogin } = storeToRefs(
			useNotificationStore(),
		);
		showEnableNotificationsAfterLogin.value = false;

		Preferences.remove({ key: LocalStorage.user_id });
		Preferences.remove({ key: LocalStorage.notificationToken });
		useModerationStore().reset();
		useInAppNotificationStore().reset();
		useInventoryStore().clear();
		useSubscriptionStore().clearSubscriptionState();

		if (deviceFingerprint.value && user.value) {
			onLoginEvent({
				user_id: user.value._id,
				fingerprint: deviceFingerprint.value,
				loggedIn: false,
			});
		}

		socketDisconnect();

		if (ionRouter) {
			ionRouter.navigate(FRONTEND_ROUTES.login, "root", "replace");
		}

		await FirebaseAuthentication.signOut();
		isLoggedIn.value = false;
		user.value = undefined;
		lastHydratedAt.value = 0;
	}

	async function waitUntilInitialized(): Promise<User | undefined> {
		if (!isAuthLoading.value) return user.value;

		return new Promise((resolve) => {
			const unwatch = watch(
				isAuthLoading,
				(loading) => {
					if (!loading) {
						unwatch();
						resolve(user.value);
					}
				},
				{ immediate: true },
			);

			setTimeout(() => {
				unwatch();
				resolve(undefined);
			}, 10000);
		});
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
		refresh,
		waitUntilInitialized,
		onlineUpdateRequired,
	};
});
