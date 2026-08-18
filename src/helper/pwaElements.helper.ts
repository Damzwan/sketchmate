import { Capacitor } from "@capacitor/core";

let registration: Promise<void> | undefined;

/**
 * Camera UI custom elements are a web-only fallback. Loading their ES5 runtime
 * at app mount made native Android parse and retain code it can never use.
 */
export function ensurePwaElements(): Promise<void> {
	if (Capacitor.isNativePlatform()) return Promise.resolve();

	registration ??= import("@ionic/pwa-elements/loader").then(
		({ defineCustomElements }) => {
			defineCustomElements(window);
		},
	);
	return registration;
}
