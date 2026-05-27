import { IS_DEV, isNative } from "@/helper/general.helper";

export enum mixpanelEvents {
	presentPaywall = "paywall-present",
}

// Keep a reference to the dynamically loaded module instance
let mixpanelInstance: any = null;
let isInitialized = false;

export const initMixpanel = async () => {
	if (isInitialized) return mixpanelInstance;

	const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN;
	if (!MIXPANEL_TOKEN) {
		console.warn("Mixpanel token is missing.");
		return null;
	}

	try {
		// Dynamically import the core loader package on-demand
		const mixpanelModule = await import(
			"mixpanel-browser/src/loaders/loader-module-core"
		);

		// The default export or specific module structure based on the loader path
		mixpanelInstance = mixpanelModule.default || mixpanelModule;

		mixpanelInstance.init(MIXPANEL_TOKEN, {
			api_host: "https://api-eu.mixpanel.com",
			persistence: "localStorage",
			batch_requests: !IS_DEV,
		});

		isInitialized = true;
		return mixpanelInstance;
	} catch (error) {
		console.error("Failed to lazily load Mixpanel:", error);
		return null;
	}
};

export async function mixpanelIdentify(userId: string) {
	const mp = await initMixpanel();
	if (mp) {
		mp.identify(userId);
	}
}

export const trackEvent = async (
	name: string,
	properties?: Record<string, any>,
) => {
	if (IS_DEV) return;

	const mp = await initMixpanel();
	if (mp) {
		mp.track(name, {
			...properties,
			platform: isNative() ? "mobile" : "desktop",
		});
	}
};
