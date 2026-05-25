// helper/notification.helper.ts
import { LocalNotifications } from "@capacitor/local-notifications";
import { FRONTEND_ROUTES } from "@/types/router.types";
import router from "@/router";
import {
	PushNotifications,
	type ActionPerformed,
} from "@capacitor/push-notifications";
import { NotificationType } from "@/types/server.types";
import { useToast } from "@/service/toast.service";
import { isNative } from "@/helper/general.helper";
import { deleteToken, getMessaging, getToken } from "firebase/messaging";
import { useNotificationStore } from "@/store/notification.store";
import { socketLoggedInPromise } from "@/service/api/socket/socket.service";
import { socketJoinRoom } from "@/service/api/socket/drawSyncing.socket";
import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useInboxSwiper } from "@/composables/gallery/useInboxSwiper";
import { useInboxStore } from "@/store/inbox.store";

const LOCAL_NOTIFICATION_ID = 1;
const PUSH_REGISTRATION_TIMEOUT_MS = 15_000;

// ============================================================
// Public API
// ============================================================

/**
 * Request OS permission and register for push notifications.
 * Resolves only once the token has been received and synced to the server.
 * Returns false if permission was denied or registration failed.
 */
export async function requestNotifications(): Promise<boolean> {
	try {
		if (isNative()) {
			const granted = await ensureNativePermission();
			if (!granted) return false;
			await scheduleLocalReminder();
			await registerForPush();
		} else {
			const ok = await pwaRequestNotifications();
			if (!ok) return false;
		}
		return true;
	} catch (e) {
		console.error("requestNotifications failed", e);
		useToast().toast("Could not enable notifications, please try again", {
			color: "danger",
		});
		return false;
	}
}

/**
 * Unregister and tear down everything related to push notifications for this device.
 * Awaits every step so the caller knows the operation is complete.
 */
export async function disableNotifications(): Promise<void> {
	try {
		if (isNative()) {
			await Promise.allSettled([
				PushNotifications.unregister(),
				cancelLocalReminder(),
			]);
		} else {
			try {
				await deleteToken(getMessaging());
			} catch (e) {
				// Non-fatal: continue with server-side unsubscribe regardless
				console.warn("deleteToken failed (continuing)", e);
			}
		}
		await useNotificationStore().setNotifications(undefined);
	} catch (e) {
		console.error("disableNotifications failed", e);
		useToast().toast("Could not disable notifications", { color: "danger" });
		throw e;
	}
}

/**
 * Registers all listeners. Safe to call once on app start, before login.
 * Listeners internally wait for auth to be ready before mutating state.
 */
export async function addNotificationListeners(): Promise<void> {
	if (isNative()) {
		await setupNativeListeners();
	} else {
		setupPwaListener();
	}
}

// ============================================================
// Native: permission + registration
// ============================================================

async function ensureNativePermission(): Promise<boolean> {
	let status = await LocalNotifications.checkPermissions();
	if (status.display !== "granted") {
		status = await LocalNotifications.requestPermissions();
	}
	if (status.display !== "granted") {
		useToast().toast("Please enable notifications in your device settings", {
			color: "danger",
		});
		return false;
	}
	return true;
}

/**
 * Calls PushNotifications.register() and waits for the registration listener
 * to deliver a token (which then syncs to the server). Times out if no token
 * arrives, so the UI doesn't hang.
 */
async function registerForPush(): Promise<void> {
	// Make sure any previous registration is torn down first so the OS reliably
	// fires a fresh 'registration' event.
	await PushNotifications.unregister().catch(() => {});

	const tokenPromise = waitForNextRegistration(PUSH_REGISTRATION_TIMEOUT_MS);
	await PushNotifications.register();
	await tokenPromise;
}

/**
 * Resolves when the next 'registration' event fires, or rejects on timeout /
 * registration error. The persistent listener (set up in addNotificationListeners)
 * also runs and handles the store sync — this is just here to gate the UI flow.
 */
function waitForNextRegistration(timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const cleanup = async () => {
			settled = true;
			await Promise.all([
				regHandle.then((h) => h.remove()).catch(() => {}),
				errHandle.then((h) => h.remove()).catch(() => {}),
			]);
		};

		const regHandle = PushNotifications.addListener(
			"registration",
			async (t) => {
				if (settled) return;
				await cleanup();
				resolve(t.value);
			},
		);

		const errHandle = PushNotifications.addListener(
			"registrationError",
			async (err) => {
				if (settled) return;
				await cleanup();
				reject(new Error(err.error || "Push registration failed"));
			},
		);

		setTimeout(async () => {
			if (settled) return;
			await cleanup();
			reject(new Error("Push registration timed out"));
		}, timeoutMs);
	});
}

// ============================================================
// PWA: permission + token
// ============================================================

async function pwaRequestNotifications(): Promise<boolean> {
	const { toast } = useToast();

	if (!navigator.serviceWorker) {
		toast("No service worker available", { color: "danger" });
		return false;
	}

	const permission = await Notification.requestPermission();
	if (permission !== "granted") {
		toast("Notifications are not allowed, enable them and try again", {
			color: "danger",
		});
		return false;
	}

	const registration = await navigator.serviceWorker.getRegistration();
	const messaging = getMessaging();
	const token = await getToken(messaging, {
		vapidKey: import.meta.env.VITE_VAPID_PUBLIC,
		serviceWorkerRegistration: registration,
	});

	if (!token) {
		toast("Could not retrieve notification token", { color: "danger" });
		return false;
	}

	await useNotificationStore().setNotifications(token);
	return true;
}

// ============================================================
// Local reminder notification
// ============================================================

async function scheduleLocalReminder(): Promise<void> {
	await cancelLocalReminder();
	// Brief delay because LocalNotifications.cancel isn't reliably synchronous
	// on all platforms (the platform queue needs a tick to drain).
	await new Promise((r) => setTimeout(r, 200));

	await LocalNotifications.schedule({
		notifications: [
			{
				title: "SketchMate time!",
				body: "Surprise your mate with a nice drawing",
				id: LOCAL_NOTIFICATION_ID,
				schedule: { on: { hour: 14, minute: 0 } },
			},
		],
	});
}

async function cancelLocalReminder(): Promise<void> {
	// getPending() is unreliable across platforms, so cancel the known id directly.
	await LocalNotifications.cancel({
		notifications: [{ id: LOCAL_NOTIFICATION_ID }],
	});
}

// ============================================================
// Listener setup
// ============================================================

async function setupNativeListeners(): Promise<void> {
	// Notification channel (Android)
	const channels = await PushNotifications.listChannels().catch(() => ({
		channels: [],
	}));
	if (!channels.channels.some((c) => c.id === "1")) {
		await PushNotifications.createChannel({
			id: "1",
			importance: 5,
			name: "Drawings from friends",
			visibility: 1,
			vibration: true,
		});
	}

	// Persistent registration listener — fires on initial register AND on token rotation.
	// Waits for auth before mutating store state, so it's safe even if it fires before login.
	await PushNotifications.addListener("registration", async (token) => {
		try {
			const { waitUntilInitialized, user } = useAuthStore();
			await waitUntilInitialized();
			if (!user) return; // No logged-in user — drop the token; store will pick it up post-login via init()
			await useNotificationStore().handleTokenRefresh(token.value);
		} catch (e) {
			console.error("Failed to handle registration event", e);
		}
	});

	await PushNotifications.addListener("registrationError", (err) => {
		console.error("Push registration error", err);
	});

	// Suppress in-app banner for foreground messages
	await PushNotifications.addListener("pushNotificationReceived", async () => {
		try {
			const delivered = await PushNotifications.getDeliveredNotifications();
			await PushNotifications.removeDeliveredNotifications(delivered);
		} catch (e) {
			console.warn("Failed to clear delivered notifications", e);
		}
	});

	await PushNotifications.addListener(
		"pushNotificationActionPerformed",
		handlePushAction,
	);

	await LocalNotifications.addListener(
		"localNotificationActionPerformed",
		async (notification) => {
			await router.push(FRONTEND_ROUTES.draw);
			await LocalNotifications.removeDeliveredNotifications({
				notifications: [notification.notification],
			}).catch(() => {});
		},
	);
}

function setupPwaListener(): void {
	const channel = new BroadcastChannel("pwa_sw");
	channel.onmessage = (event) => {
		const data = event.data;
		router.push({ path: data.path, query: data.query });
	};
}

// ============================================================
// Notification action routing
// ============================================================

type NotificationData = Record<string, string> & { type: NotificationType };
type NotificationHandler = (data: NotificationData) => void | Promise<void>;

const pushToRoute = (path: FRONTEND_ROUTES, query?: Record<string, string>) =>
	router.push(query ? { path, query } : { path });

const navigateToChat = async (conversation_id: string) => {
	useChatWidgetStore().openPrivateChat(conversation_id);
};

const handlers: Partial<Record<NotificationType, NotificationHandler>> = {
	[NotificationType.lobby_invitation]: async (data) => {
		await pushToRoute(FRONTEND_ROUTES.draw);
		await socketLoggedInPromise;
		socketJoinRoom({ roomId: data.lobby_id, intent: "join" });
	},
	[NotificationType.drawing_received]: async (data) => {
		const item = await useInboxStore().fetchSingleInboxItem(
			data.conversation_id,
		);
		if (item) useInboxSwiper().openInboxSwiper([item], 0);
	},
	[NotificationType.dm_message]: async (d) => navigateToChat(d.conversation_id),
	[NotificationType.mate_request]: async (d) =>
		navigateToChat(d.conversation_id),
	[NotificationType.request_accepted]: async (d) =>
		navigateToChat(d.conversation_id),
	[NotificationType.balloon_match]: async (d) =>
		navigateToChat(d.conversation_id),
	[NotificationType.moderation_strike]: async () => {
		pushToRoute(FRONTEND_ROUTES.moderation);
	},
	[NotificationType.moderation_lifted]: async () => {
		pushToRoute(FRONTEND_ROUTES.moderation);
	},
};

async function handlePushAction(notification: ActionPerformed) {
	const data = notification.notification.data as NotificationData;
	const handler = handlers[data.type];
	if (!handler) {
		console.warn(`No handler registered for notification type: ${data.type}`);
		return;
	}

	const { waitUntilInitialized } = useAuthStore();
	await Promise.all([router.isReady(), waitUntilInitialized()]);
	await handler(data);
}
