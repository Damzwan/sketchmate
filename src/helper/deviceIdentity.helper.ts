import { Device } from "@capacitor/device";
import { isNative } from "@/helper/platform.helper";

/**
 * DEVICE IDENTITY — for ban evasion detection only.
 *
 * Not to be confused with `generateDeviceFingerprint()` in general.helper.ts.
 * That one is a random UUID we mint ourselves and keep in Preferences; it
 * identifies an INSTALL (for routing push notifications to the right device)
 * and it is wiped the moment the app is uninstalled. That makes it useless for
 * the thing this file is for, because uninstall-then-reinstall is exactly the
 * loop a banned user runs.
 *
 * This returns the *platform's* device identifier instead, which the OS owns
 * and we cannot reset:
 *
 *   Android — Settings.Secure.ANDROID_ID. Scoped per app-signing-key since
 *     Android 8, so it is not correlatable with any other developer's app. It
 *     SURVIVES uninstall/reinstall. It does not survive a factory reset, which
 *     is the accepted gap: wiping a phone to get back into a drawing app is a
 *     far higher bar than tapping reinstall.
 *
 *   iOS — identifierForVendor. Weaker: it resets once every app from this
 *     vendor is removed from the device, which for a single-app vendor means an
 *     ordinary uninstall clears it. Reported as `durable: false` so the server
 *     can tell a strong signal from a weak one. To close this, the id needs to
 *     be a UUID held in the Keychain (Keychain entries outlive app deletion) —
 *     that needs a native plugin, and there is no ios/ project in this repo
 *     yet, so it is deliberately left for when one exists.
 *
 *   Web/PWA — returns null. There is no durable device identity in a browser,
 *     and inventing one from an install-scoped UUID would be worse than
 *     nothing: it would churn on every reinstall while creating the false
 *     impression that the device is being recognised.
 */
export interface DeviceIdentity {
	device_id: string;
	platform: "android" | "ios";
	/** Whether this id is expected to survive an uninstall/reinstall cycle. */
	durable: boolean;
}

export async function getDeviceIdentity(): Promise<DeviceIdentity | null> {
	// Browsers have no device identity worth sending. Bail before touching the
	// plugin so this stays safe to call unconditionally from shared code.
	if (!isNative()) return null;

	try {
		const [{ identifier }, info] = await Promise.all([
			Device.getId(),
			Device.getInfo(),
		]);

		if (!identifier) return null;
		if (info.platform !== "android" && info.platform !== "ios") return null;

		return {
			device_id: identifier,
			platform: info.platform,
			durable: info.platform === "android",
		};
	} catch (err) {
		// A missing device id must never block sign-in. The account simply goes
		// unrecognised, which is the same position we were in before this existed.
		console.warn("Could not read device identity", err);
		return null;
	}
}
