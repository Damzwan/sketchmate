import { defineStore } from "pinia";
import { type Ref, ref } from "vue";
import { DrawTool } from "@/draw/tools/tool.types";
import { Menu, type StickersEmblemsSavedTabOptions } from "@/types/menu.types";

export const useMenuStore = defineStore("menu", () => {
	const penMenuOpen = ref(false);
	const eraserMenuOpen = ref(false);
	const stickerMenuOpen = ref(false);
	const shapesMenuOpen = ref(false);
	const cropperMenuOpen = ref(false);
	const selectMenuOpen = ref(false);
	const sendMenuOpen = ref(false);
	const moreToolsMenuOpen = ref(false);
	const selectMoreOptionsMenuOpen = ref(false);
	const selectColorMenuOpen = ref(false);
	const fontMenuOpen = ref(false);
	const textMenuOpen = ref(false);
	const selectImgStyleMenuOpen = ref(false);
	const feedbackMenuOpen = ref(false);
	const helpMenuOpen = ref(false);
	const dateOfBirthConfirmationOpen = ref(false);
	const drawMenuOpen = ref(false);
	const roomMenuOpen = ref(false);
	const chatMenuOpen = ref(false);
	const viewProfileMenuOpen = ref(false);
	const bucketMenuOpen = ref(false);
	const smudgeMenuOpen = ref(false);
	const connectionMenuOpen = ref(false);
	const moderationMenuOpen = ref(false);
	const sharePostMenuOpen = ref(false);
	const reportMenuOpen = ref(false);
	const balloonMenuOpen = ref(false);
	const textEditMenuOpen = ref(false);
	const referenceMenuOpen = ref(false);
	const isShopOpen = ref(false);
	const isOnlineUpgradeMenuOpen = ref(false);
	const isPaywallOpen = ref(false);
	const isWhatsNewOpen = ref(false);
	// The weekly winners moment. Lives here (not in competition.store) so
	// ambientPause and the modal-priority checks can see it like any other
	// full-screen overlay.
	const isCompetitionResultsOpen = ref(false);

	const shopScrollTarget = ref<string | null>(null);
	const shopEquipTarget = ref<"profile" | "chat">("profile");

	const stickersEmblemsSavedSelectedTab =
		ref<StickersEmblemsSavedTabOptions>("sticker");

	const menuEvent = ref<Event>();

	const menuMapping: { [key in Menu]: Ref<boolean> } = {
		[Menu.Pen]: penMenuOpen,
		[Menu.Eraser]: eraserMenuOpen,
		[Menu.StickerEmblemSaved]: stickerMenuOpen,
		[Menu.Shapes]: shapesMenuOpen,
		[Menu.Cropper]: cropperMenuOpen,
		[Menu.Select]: selectMenuOpen,
		[Menu.Send]: sendMenuOpen,
		[Menu.MoreTools]: moreToolsMenuOpen,
		[Menu.SelectMoreOptions]: selectMoreOptionsMenuOpen,
		[Menu.SelectColor]: selectColorMenuOpen,
		[Menu.Font]: fontMenuOpen,
		[Menu.Text]: textMenuOpen,
		[Menu.SelectImgStyle]: selectImgStyleMenuOpen,
		[Menu.FeedbackMenu]: feedbackMenuOpen,
		[Menu.HelpMenu]: helpMenuOpen,
		[Menu.DateOfBirth]: dateOfBirthConfirmationOpen,
		[Menu.DrawMenu]: drawMenuOpen,
		[Menu.DrawRoomMenu]: roomMenuOpen,
		[Menu.ChatMenuOpen]: chatMenuOpen,
		[Menu.ViewProfileMenu]: viewProfileMenuOpen,
		[Menu.Bucket]: bucketMenuOpen,
		[Menu.Smudge]: smudgeMenuOpen,
		[Menu.ConnectionMenu]: connectionMenuOpen,
		[Menu.ModerationMenu]: moderationMenuOpen,
		[Menu.SharePostMenu]: sharePostMenuOpen,
		[Menu.ReportMenu]: reportMenuOpen,
		[Menu.BalloonMenu]: balloonMenuOpen,
		[Menu.TextEditMenu]: textEditMenuOpen,
		[Menu.Shop]: isShopOpen,
		[Menu.UpgradeOnline]: isOnlineUpgradeMenuOpen,
		[Menu.Reference]: referenceMenuOpen,
	};

	const toolMenuMapping: { [key in DrawTool]: Menu | undefined } = {
		[DrawTool.Pen]: Menu.Pen,
		[DrawTool.Bucket]: Menu.Bucket,
		[DrawTool.Smudge]: Menu.Smudge,
		[DrawTool.MobileEraser]: Menu.Eraser,
		[DrawTool.Lasso]: Menu.Select,
		[DrawTool.Select]: Menu.Select,
	};

	function openToolMenu(tool: DrawTool, event: Event | undefined = undefined) {
		const menu = toolMenuMapping[tool];
		if (menu != undefined) openMenu(menu, event);
	}

	function openMenu(menu: Menu, event: Event | undefined = undefined) {
		menuMapping[menu].value = !menuMapping[menu].value;
		if (event) menuEvent.value = event;
	}

	function closeMenu(menu: Menu) {
		menuMapping[menu].value = false;
	}

	// Menus are closed through the mapping rather than one assignment per ref, so
	// adding a Menu member cannot silently leave an overlay stuck open across a
	// logout. isPaywallOpen / isWhatsNewOpen are not in the mapping.
	function resetRuntimeState() {
		for (const open of Object.values(menuMapping)) open.value = false;
		isPaywallOpen.value = false;
		isWhatsNewOpen.value = false;
		isCompetitionResultsOpen.value = false;
		menuEvent.value = undefined;
		shopScrollTarget.value = null;
		shopEquipTarget.value = "profile";
		stickersEmblemsSavedSelectedTab.value = "sticker";
	}

	function openShop(
		targetItemId?: string,
		equipTarget: "profile" | "chat" = "profile",
	) {
		shopScrollTarget.value = targetItemId ?? null;
		shopEquipTarget.value = equipTarget;
		isShopOpen.value = true;
	}

	return {
		penMenuOpen,
		eraserMenuOpen,
		stickerMenuOpen,
		shapesMenuOpen,
		openMenu,
		openToolMenu,
		menuEvent,
		cropperMenuOpen,
		stickersEmblemsSavedSelectedTab,
		selectMenuOpen,
		sendMenuOpen,
		moreToolsMenuOpen,
		selectMoreOptionsMenuOpen,
		selectColorMenuOpen,
		selectImgStyleMenuOpen,
		textMenuOpen,
		fontMenuOpen,
		feedbackMenuOpen,
		helpMenuOpen,
		balloonMenuOpen,
		dateOfBirthConfirmationOpen,
		drawMenuOpen,
		roomMenuOpen,
		chatMenuOpen,
		viewProfileMenuOpen,
		bucketMenuOpen,
		smudgeMenuOpen,
		connectionMenuOpen,
		moderationMenuOpen,
		sharePostMenuOpen,
		closeMenu,
		reportMenuOpen,
		textEditMenuOpen,
		referenceMenuOpen,
		isShopOpen,
		isOnlineUpgradeMenuOpen,
		isPaywallOpen,
		shopScrollTarget,
		shopEquipTarget,
		openShop,
		isWhatsNewOpen,
		isCompetitionResultsOpen,
		resetRuntimeState,
	};
});
