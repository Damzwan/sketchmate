import { isPlatform } from "@ionic/vue";

export const IS_PROD = import.meta.env.VITE_ENVIRONMENT === "prod";
export const IS_DEV = !IS_PROD;

export function isMobile() {
	return (
		isPlatform("mobile") ||
		isPlatform("capacitor") ||
		isPlatform("android") ||
		isPlatform("ios")
	);
}

export function isConstrainedDevice() {
	return (
		typeof document !== "undefined" &&
		(document.documentElement.classList.contains("low-end") ||
			document.documentElement.classList.contains("android-wv"))
	);
}

export function isNative() {
	return isPlatform("capacitor");
}

export function isIOS() {
	return isPlatform("ios");
}

export function isMac() {
	return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export function isSafari() {
	const userAgentString = navigator.userAgent;
	const chromeAgent = userAgentString.indexOf("Chrome") > -1;
	let safariAgent = userAgentString.indexOf("Safari") > -1;
	if (chromeAgent && safariAgent) safariAgent = false;
	return safariAgent;
}

export function isRunningStandalone() {
	return window.matchMedia("(display-mode: standalone)").matches;
}

export function showIosSafariInstructions() {
	return isIOS() && isSafari() && !isRunningStandalone();
}

type IdleCallback = (deadline: {
	timeRemaining: () => number;
	didTimeout: boolean;
}) => void;

export function whenIdle(cb: IdleCallback, timeout = 3000): void {
	if (typeof (window as any).requestIdleCallback === "function") {
		(window as any).requestIdleCallback(cb, { timeout });
	} else {
		setTimeout(() => cb({ timeRemaining: () => 50, didTimeout: false }), 1500);
	}
}
