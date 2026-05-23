import { createApp } from "vue";
import router from "./router";

import { IonicVue } from "@ionic/vue";

/* Core CSS required for Ionic components to work properly */
import "@ionic/vue/css/core.css";

/* Theme variables */
import "./theme/fonts.css";
import "./theme/theme.scss";
import "@/theme/main.css";
import "@/theme/liquid-glass.css";
import "@/theme/text_effects.css";

import { createPinia } from "pinia";
import mitt from "mitt";
import App from "@/App.vue";
import { addNotificationListeners } from "@/helper/notification.helper";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
	handleWebDeeplink,
	initBilling,
	initFirebase,
	setupDeeplinkListener,
	setupPwa,
	setupWidget,
} from "@/helper/general.helper";
import { useSubscriptionStore } from "@/store/subscription.store";
import { initMixpanel } from "@/service/mixpanel";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import duration from "dayjs/plugin/duration";
import isToday from "dayjs/plugin/isToday";
import isYesterday from "dayjs/plugin/isYesterday";

const pinia = createPinia();
initFirebase();

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

export const EventBus = mitt();
const app = createApp(App).use(IonicVue).use(pinia).use(router);

initBilling().then(() => {
	const { checkProStatus } = useSubscriptionStore();
	checkProStatus();
	app.mount("#app");
});

addNotificationListeners();
setupDeeplinkListener();
handleWebDeeplink();
setupPwa();
setupWidget();
initMixpanel();

if (Capacitor.isNativePlatform()) {
	StatusBar.setStyle({ style: Style.Light });
}
