import type { ToastButton } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";

export const viewSavedButton: ToastButton = {
	text: "View",
	handler: () => {
		const { openMenu } = useMenuStore();
		const { stickersEmblemsSavedSelectedTab } = storeToRefs(useMenuStore());
		stickersEmblemsSavedSelectedTab.value = "saved";
		openMenu(Menu.StickerEmblemSaved);
	},
};
