import { useConfirm } from "@/composables/useConfirm";
import { isInRoom } from "@/draw/sync/syncStatus";
import router from "@/router";
import { useToast } from "@/service/toast.service";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

interface DrawingRemixOptions {
	canvasUrl: string;
	header: string;
	message: string;
	confirmText: string;
	replaceCurrent?: {
		subHeader: string;
		message: string;
	};
}

/** Shared room guard, confirmation and canvas navigation for remix actions. */
export function useDrawingRemix() {
	const swiper = usePhotoSwiper();
	const { toast } = useToast();
	const { confirm } = useConfirm();

	async function openDrawingCopy(options: DrawingRemixOptions): Promise<void> {
		if (isInRoom()) {
			toast("Not allowed when in a lobby", { color: "warning" });
			return;
		}

		const isOnDrawPage =
			router.currentRoute.value.path === `/${FRONTEND_ROUTES.draw}`;
		const replacement = isOnDrawPage ? options.replaceCurrent : undefined;
		const approved = await confirm({
			header: options.header,
			...(replacement ? { subHeader: replacement.subHeader } : {}),
			message: replacement?.message ?? options.message,
			confirmText: options.confirmText,
		});
		if (!approved) return;

		swiper.close();
		const query = {
			canvas_url: options.canvasUrl,
			mode: "solo",
			...(options.replaceCurrent ? { id: crypto.randomUUID() } : {}),
		};
		if (!replacement) {
			void router.push({ path: FRONTEND_ROUTES.draw, query });
			return;
		}

		await router.replace({ query });
		const { useDrawStore } = await import("@/draw/session/draw.store");
		const canvas = document.getElementById("mainCanvas") as HTMLCanvasElement;
		if (!canvas || !("id" in query)) return;
		await useDrawStore().initCanvas(canvas, {
			isLobby: false,
			draftId: query.id,
			canvasUrl: query.canvas_url,
		});
	}

	return { openDrawingCopy };
}
