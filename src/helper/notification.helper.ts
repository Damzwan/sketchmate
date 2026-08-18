// helper/notification.helper.ts
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import {
	type ActionPerformed,
	PushNotifications,
} from "@capacitor/push-notifications";
import { isNative } from "@/helper/platform.helper";
import router from "@/router";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationStore } from "@/store/notification.store";
import { FRONTEND_ROUTES } from "@/types/router.types";
import type { QuotaState } from "@/types/server.types";
import { NotificationType } from "@/types/server.types";
import { LocalStorage } from "@/types/storage.types";

const LEGACY_DAILY_REMINDER_ID = 1;
const POST_QUOTA_RESET_REMINDER_ID = 2;
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
			await registerForPush();
			const { refreshNotificationQuota } = await import(
				"@/service/notificationActions"
			);
			await syncPostQuotaResetReminder(await refreshNotificationQuota());
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
				cancelPostQuotaResetReminder(),
				cancelLegacyDailyReminder(),
			]);
		} else {
			try {
				// DYNAMIC IMPORT HERE
				const { getMessaging, deleteToken } = await import(
					"firebase/messaging"
				);
				await deleteToken(getMessaging());
			} catch (e) {
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
	// No unregister() first, deliberately. It deletes the FCM instance token,
	// and register() already fires 'registration' with the current token on
	// every call — so the teardown bought nothing and opened a window where the
	// app could persist a token the OS had just invalidated, leaving the device
	// subscribed with a dead token and silently receiving nothing.
	const tokenPromise = waitForNextRegistration(PUSH_REGISTRATION_TIMEOUT_MS);
	await PushNotifications.register();
	const token = await tokenPromise;

	// Don't report success until the token is actually synced to the server.
	// The persistent listener also syncs, but it runs independently — awaiting
	// here guarantees the subscription exists before the caller navigates away.
	// setNotifications is idempotent + serialized, so the double call is a no-op.
	await useNotificationStore().setNotifications(token);
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

	// DYNAMIC IMPORT HERE
	const { getMessaging, getToken } = await import("firebase/messaging");

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
// Post quota reset reminder
// ============================================================

/**
 * Keep one native reminder for the next post-quota reset. It is deliberately
 * local rather than server-scheduled, so 10:00 means 10:00 for the user without
 * collecting their timezone. Users with no posts today have no reminder.
 */
export async function syncPostQuotaResetReminder(
	postQuota: QuotaState,
): Promise<void> {
	try {
		await syncPostQuotaResetReminderUnsafe(postQuota);
	} catch (e) {
		// Reminders are best-effort and must never break publishing/deleting posts
		// or make the main notification toggle appear to have failed.
		console.warn("Could not sync post quota reset reminder", e);
	}
}

async function syncPostQuotaResetReminderUnsafe(
	postQuota: QuotaState,
): Promise<void> {
	if (!isNative()) return;

	if (postQuota.used <= 0 || !postQuota.reset_at) {
		await cancelPostQuotaResetReminder();
		return;
	}

	const permission = await LocalNotifications.checkPermissions();
	if (permission.display !== "granted") return;

	const resetAt = new Date(postQuota.reset_at);
	if (Number.isNaN(resetAt.getTime())) return;

	const at = favourableLocalTimeAfter(resetAt);
	await cancelPostQuotaResetReminder();
	// Brief delay because LocalNotifications.cancel isn't reliably synchronous
	// on all platforms (the platform queue needs a tick to drain).
	await new Promise((r) => setTimeout(r, 200));

	await LocalNotifications.schedule({
		notifications: [
			{
				title: "Your post slots are ready",
				body: "Your daily SketchMate post allowance has reset.",
				id: POST_QUOTA_RESET_REMINDER_ID,
				schedule: { at },
			},
		],
	});
}

function favourableLocalTimeAfter(resetAt: Date): Date {
	const at = new Date(resetAt);
	const hour = at.getHours();

	if (hour < 10) {
		at.setHours(10, 0, 0, 0);
	} else if (hour >= 20) {
		at.setDate(at.getDate() + 1);
		at.setHours(10, 0, 0, 0);
	}

	return at;
}

async function cancelPostQuotaResetReminder(): Promise<void> {
	// getPending() is unreliable across platforms, so cancel the known id directly.
	await LocalNotifications.cancel({
		notifications: [{ id: POST_QUOTA_RESET_REMINDER_ID }],
	});
}

async function cancelLegacyDailyReminder(): Promise<void> {
	await LocalNotifications.cancel({
		notifications: [{ id: LEGACY_DAILY_REMINDER_ID }],
	});
}

// ============================================================
// Listener setup
// ============================================================

async function setupNativeListeners(): Promise<void> {
	// Older builds scheduled an unconditional repeating reminder. Remove it once
	// this build starts; quota reminders below are selective and one-shot.
	await cancelLegacyDailyReminder().catch(() => {});

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
			if (!user) {
				// No logged-in user yet — persist the token so init() adopts and
				// syncs it after login instead of losing it.
				await Preferences.set({
					key: LocalStorage.notificationToken,
					value: token.value,
				});
				return;
			}
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
	const { openNotificationChat } = await import(
		"@/service/notificationActions"
	);
	await openNotificationChat(conversation_id);
};

const handlers: Partial<Record<NotificationType, NotificationHandler>> = {
	[NotificationType.lobby_invitation]: async (data) => {
		await pushToRoute(FRONTEND_ROUTES.draw);
		const { joinNotificationLobby } = await import(
			"@/service/notificationActions"
		);
		await joinNotificationLobby(data.lobby_id);
	},
	[NotificationType.drawing_received]: async (data) => {
		const { openNotificationDrawing } = await import(
			"@/service/notificationActions"
		);
		await openNotificationDrawing(data.conversation_id);
	},
	[NotificationType.dm_message]: async (d) => navigateToChat(d.conversation_id),
	[NotificationType.mate_request]: async (d) =>
		navigateToChat(d.conversation_id),
	[NotificationType.request_accepted]: async (d) =>
		navigateToChat(d.conversation_id),
	[NotificationType.balloon_match]: async (d) =>
		navigateToChat(d.conversation_id),
	// Theme/last-call pushes open the live page. Results carry the exact
	// competition id and open that week's winners, even after Monday rollover.
	[NotificationType.competition_theme]: async () => {
		pushToRoute(FRONTEND_ROUTES.competition);
	},
	[NotificationType.competition_last_call]: async () => {
		pushToRoute(FRONTEND_ROUTES.competition);
	},
	[NotificationType.competition_results]: async (data) => {
		const { openNotificationCompetition } = await import(
			"@/service/notificationActions"
		);
		await openNotificationCompetition(data.competition_id);
	},
	[NotificationType.competition_win]: async (data) => {
		const { openNotificationCompetition } = await import(
			"@/service/notificationActions"
		);
		await openNotificationCompetition(data.competition_id);
	},
	[NotificationType.moderation_strike]: async () => {
		pushToRoute(FRONTEND_ROUTES.moderation);
	},
	[NotificationType.moderation_lifted]: async () => {
		pushToRoute(FRONTEND_ROUTES.moderation);
	},
	// Standing page explains the state of your content and your account, which is
	// the question someone taps this notification to answer.
	[NotificationType.moderation_content]: async () => {
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
