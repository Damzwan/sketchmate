import { IonicVue } from "@ionic/vue";
import { createApp } from "vue";
import router from "./router";

/* Core CSS required for Ionic components to work properly */
import "@ionic/vue/css/core.css";

/* Theme variables */
import "./theme/fonts.css";
import "./theme/theme.scss";
import "@/theme/main.css";
import "@/theme/liquid-glass.css";
import "@/theme/text_effects.css";

import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import isToday from "dayjs/plugin/isToday";
import isYesterday from "dayjs/plugin/isYesterday";
import relativeTime from "dayjs/plugin/relativeTime";
import mitt from "mitt";
import { createPinia } from "pinia";
import App from "@/App.vue";
import {
	handleWebDeeplink,
	initBilling,
	initFirebase,
	isMobile,
	setupDeeplinkListener,
	setupPwa,
	setupWidget,
} from "@/helper/general.helper";
import { addNotificationListeners } from "@/helper/notification.helper";

const pinia = createPinia();
initFirebase();

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

export const EventBus = mitt();

// Low-end device flag: mobile + ≤4 logical cores (matches the draw engine's
// IS_LOW_END). Stamped on <html> before mount so CSS can drop the GPU-expensive
// backdrop blurs and shrink blur radii on weak webviews (see main.css).
if (isMobile() && (navigator.hardwareConcurrency || 4) <= 4) {
	document.documentElement.classList.add("low-end");
}

// Android System WebView flag (ALL Androids, not just low-end): its compositor
// mishandles mix-blend-mode groups that sit near self-repainting content (GIF
// avatars, background-clip:text foil) — the whole card surface re-rasterizes
// and visibly flickers. CSS keyed off this class swaps blends for tuned normal
// alpha and stills the per-frame glyph repaints (see ProfileEffect /
// text_effects.css).
if (Capacitor.getPlatform() === "android") {
	document.documentElement.classList.add("android-wv");
}

async function bootstrap() {
	const app = createApp(App).use(IonicVue).use(pinia).use(router);

	// Load observability as a separate chunk, but still attach Vue's error handler
	// before mount. A monitoring failure must never prevent the application from
	// starting.
	try {
		const { initSentry } = await import("@/observability/sentry");
		initSentry(app);
	} catch (error) {
		console.warn("[sentry] initialization failed", error);
	}

	app.mount("#app");
	initBilling();
	addNotificationListeners();
	setupDeeplinkListener();
	handleWebDeeplink();
	setupPwa();
	setupWidget();

	if (Capacitor.isNativePlatform()) {
		StatusBar.setStyle({ style: Style.Light });
	}
}

void bootstrap();
