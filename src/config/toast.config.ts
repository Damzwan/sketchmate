import { ToastButton } from "@ionic/vue";
import { useToast } from "@/service/toast.service";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import { storeToRefs } from "pinia";

export const viewSavedButton: ToastButton = {
	text: "View",
	handler: () => {
		const { openMenu } = useMenuStore();
		const { stickersEmblemsSavedSelectedTab } = storeToRefs(useMenuStore());
		stickersEmblemsSavedSelectedTab.value = "saved";
		openMenu(Menu.StickerEmblemSaved);
	},
};
