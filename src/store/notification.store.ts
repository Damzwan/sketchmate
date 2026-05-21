import { defineStore, storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { Preferences } from "@capacitor/preferences";
import { Device } from "@capacitor/device";
import { NotificationSubscription, User } from "@/types/server.types";
import { LocalStorage } from "@/types/storage.types";
import { generateDeviceFingerprint, isNative } from "@/helper/general.helper";
import { PushNotifications } from "@capacitor/push-notifications";
import { useAuthStore } from "@/store/auth.store";
import { disableNotifications } from "@/helper/notification.helper";
import { subscribe, unsubscribe } from "@/service/api/user.api";

export const useNotificationStore = defineStore("notification", () => {
	const localSubscription = ref<string>();
	const notificationsAllowed = ref(false);
	const showEnableNotificationsAfterLogin = ref(false);

	const deviceNotificationsAllowed = computed(() => {
		const { user, deviceFingerprint } = useAuthStore();
		return (
			localSubscription.value ||
			(user?.subscriptions.some((s) => s.fingerprint === deviceFingerprint) &&
				notificationsAllowed.value)
		);
	});

	async function setNotifications(token: string | undefined) {
		const { user } = storeToRefs(useAuthStore());

		if (!user.value?._id) return;

		if (token && token === localSubscription.value) return;

		localSubscription.value = token;

		if (token) {
			await Preferences.set({
				key: LocalStorage.notificationToken,
				value: token,
			});
		} else {
			await Preferences.remove({ key: LocalStorage.notificationToken });
		}

		// Device fingerprint for subscription
		const deviceInfo = await Device.getInfo();
		const fingerprint = await generateDeviceFingerprint();

		if (!token) {
			user.value.subscriptions = [
				...user.value.subscriptions.filter(
					(s) => s.fingerprint !== fingerprint,
				),
			];
			await unsubscribe({ user_id: user.value._id, fingerprint });
		} else {
			const subscription: NotificationSubscription = {
				token,
				fingerprint,
				model: deviceInfo.model,
				platform: deviceInfo.platform,
				os: deviceInfo.operatingSystem,
				logged_in: true,
			};
			user.value.subscriptions = [...user.value.subscriptions, subscription];
			await subscribe({ user_id: user.value._id, subscription });
		}
	}

	async function init(user: User, arrivedFromLogin: boolean = false) {
		const { deviceFingerprint } = useAuthStore();
		const fingerprint = await generateDeviceFingerprint(); // Ensure consistency

		let permissionStatus;
		if (isNative()) {
			const res = await PushNotifications.checkPermissions();
			permissionStatus = res.receive;
		} else {
			permissionStatus = Notification.permission;
		}
		const hasPermission = permissionStatus === "granted";

		const hasValidSubscription = user?.subscriptions.some(
			(s) => s.fingerprint === deviceFingerprint,
		);

		if (hasValidSubscription && !hasPermission) {
			disableNotifications();
		}

		notificationsAllowed.value = hasValidSubscription && hasPermission;

		if (arrivedFromLogin) {
			showEnableNotificationsAfterLogin.value = !notificationsAllowed.value;
		}
	}

	return {
		localSubscription,
		notificationsAllowed,
		showEnableNotificationsAfterLogin,
		deviceNotificationsAllowed,

		setNotifications,
		init,
	};
});
