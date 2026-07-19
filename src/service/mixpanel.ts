import { IS_DEV, isNative } from "@/helper/general.helper";

export enum mixpanelEvents {
	presentPaywall = "paywall-present",

	// --- v2 Navigation / engagement ---
	lobbyOpen = "lobby_open", // tapped a public lobby to join
	draftOpen = "draft_open", // opened a saved draft
	notificationsOpen = "notifications_open",
	messagesOpen = "messages_open", // opened chat panel
	shopOpen = "shop_open",
	customizationOpen = "customization_open",
	inboxItemOpen = "inbox_item_open", // opened a received drawing (story)

	// --- v2 Posts ---
	postReact = "post_react",
	postCommentsOpen = "post_comments_open",
	postFullscreenOpen = "post_fullscreen_open",
	postShareOpen = "post_share_open",
	postRemix = "post_remix",

	// --- v2 Relationships (client intent; server is authoritative) ---
	mateAdd = "mate_add", // tapped follow / add-mate
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
