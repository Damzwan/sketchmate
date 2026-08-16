import "./polyfills";
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
import mitt from "mitt";
import { createPinia } from "pinia";
import App from "@/App.vue";
// Pure config: `@ionic/vue`'s isPlatform plus a localStorage read, no fabric and
// no draw engine, so importing it here does not pull the draw chunk into the
// app-start bundle.
import {
	IS_LOW_END_DEVICE,
	IS_SEVERELY_CONSTRAINED_DEVICE,
} from "@/draw/config/renderQuality.config";
import { initFirebase } from "@/helper/firebase.helper";
// --- Updated Helper Imports (P2.2 Split) ---
import {
	handleWebDeeplink,
	setupDeeplinkListener,
	setupPwa,
	setupWidget,
} from "@/helper/general.helper";
import { addNotificationListeners } from "@/helper/notification.helper";
import { whenIdle } from "@/helper/platform.helper";
import {
	installNativeDeviceProfileBridge,
	probeGpuRenderer,
} from "@/service/deviceProfile";

const pinia = createPinia();

// Started at module eval so the `firebase/app` chunk is already in flight, but
// AWAITED before mount (see bootstrap). On web the auth store registers its
// `authStateChange` listener synchronously during setup, and that goes through
// the Firebase web SDK — which throws `app/no-app` if `initializeApp` has not
// run yet. Mounting without waiting is a race against a dynamic import, and it
// is lost whenever the chunk fetch is slow (cold dev server, cache miss).
const firebaseReady = initFirebase();

export const EventBus = mitt();

// Low-end device flag, stamped on <html> before mount so CSS can drop the
// GPU-expensive backdrop blurs and shrink blur radii on weak webviews (see
// main.css).
//
// Read from the draw engine's own predicate rather than restated here. The two
// had already drifted — this was `cores <= 4` while the engine also demoted on
// memory, GPU family and Android's isLowRamDevice() — so an 8-core 2 GB phone
// ran the full decorative blur set on the exact hardware the engine was busy
// protecting.
if (IS_LOW_END_DEVICE) {
	document.documentElement.classList.add("low-end");
}
if (IS_SEVERELY_CONSTRAINED_DEVICE) {
	document.documentElement.classList.add("min-end");
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

// Both halves of the device profile are LEARNED and persisted for the next
// launch — neither can be read synchronously in time to influence this one (see
// service/deviceProfile.ts). The listener goes up before mount because the
// native side starts emitting ~2.5 s after the activity is created; the GPU
// probe costs a throwaway WebGL context and is deferred to idle.
installNativeDeviceProfileBridge();

async function bootstrap() {
	// Native resolves this immediately (the helper returns before its import), so
	// only the PWA pays anything, and only for a chunk already being fetched.
	await firebaseReady;

	const app = createApp(App).use(IonicVue).use(pinia).use(router);

	app.mount("#app");

	// Eager synchronous setup
	addNotificationListeners();
	setupDeeplinkListener();
	handleWebDeeplink();
	setupPwa();
	setupWidget();

	if (Capacitor.isNativePlatform()) {
		StatusBar.setStyle({ style: Style.Light });
	}

	// The probe creates a short-lived EGL context. It is useful only for Android
	// policy, and deviceProfile reuses the persisted renderer on later launches
	// instead of repeating that lifecycle traffic.
	if (Capacitor.getPlatform() === "android") {
		whenIdle(() => probeGpuRenderer());
	}

	// Let WebView commit the first application frame before parsing monitoring.
	// Billing initializes on first authenticated use, so login and anonymous
	// sessions never pay for RevenueCat during app-shell startup.
	requestAnimationFrame(() => {
		setTimeout(() => {
			void import("@/observability/sentry")
				.then(({ initSentry }) => initSentry(app))
				.catch((error) =>
					console.warn("[sentry] initialization failed", error),
				);
		}, 0);
	});
}

void bootstrap();
