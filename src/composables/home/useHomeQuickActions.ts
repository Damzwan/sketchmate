import { useIonRouter } from "@ionic/vue";
import { onMounted } from "vue";
import { masterAnimation } from "@/helper/animation.helper";
import {
	isConstrainedDevice,
	isMobile,
	whenIdle,
} from "@/helper/platform.helper";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import { FRONTEND_ROUTES } from "@/types/router.types";

type HomeQuickAction = "draw_alone" | "draw_together" | "share" | "balloon";

export function useHomeQuickActions() {
	const router = useIonRouter();
	const menu = useMenuStore();
	let drawPrefetched = false;

	function prefetchDrawView() {
		if (drawPrefetched) return;
		drawPrefetched = true;
		void import("@/views/draw.view.vue").catch(() => {});
	}
	function handleQuickAction(action: string) {
		switch (action as HomeQuickAction) {
			case "draw_alone":
				void router.push(FRONTEND_ROUTES.draw, masterAnimation);
				break;
			case "draw_together":
				void router.push(
					{ path: FRONTEND_ROUTES.draw, query: { together: "true" } },
					masterAnimation,
				);
				break;
			case "share":
				menu.openMenu(Menu.ConnectionMenu);
				break;
			case "balloon":
				menu.openMenu(Menu.BalloonMenu);
		}
	}

	onMounted(() => {
		const cores = navigator.hardwareConcurrency ?? 8;
		if (!isConstrainedDevice() && (!isMobile() || cores > 4))
			whenIdle(prefetchDrawView, 1_500);
	});

	return { handleQuickAction, prefetchDrawView };
}
