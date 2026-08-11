<template>
  <ion-action-sheet
    :is-open="helpMenuOpen"
    trigger="helpMenu"
    color="background"
    mode="ios"
    :buttons="helpActionSheetButtons"
    @didDismiss="() => helpMenuOpen = false"
  />
  <ion-button id="docsMenu" class="hidden absolute" />

</template>

<script setup lang="ts">
import { ActionSheetButton, IonActionSheet, IonButton } from "@ionic/vue";
import { mdiBookOpenOutline, mdiMessageAlertOutline } from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";

const { openMenu } = useMenuStore();
const { helpMenuOpen } = storeToRefs(useMenuStore());

const helpActionSheetButtons: ActionSheetButton[] = [
	{
		text: "Manual",
		role: "selected",
		icon: svg(mdiBookOpenOutline),
		handler: () => {
			document.getElementById("docsMenu")?.click();
		},
	},
	{
		text: "Feedback",
		role: "selected",
		icon: svg(mdiMessageAlertOutline),
		handler: () => openMenu(Menu.FeedbackMenu),
	},
	{
		text: "Cancel",
		role: "cancel",
		data: {
			action: "cancel",
		},
	},
];
</script>


<style scoped>
ion-action-sheet {
  --background: var(--ion-color-primary);
  --button-background-selected: var(--ion-color-primary);
  --button-color: var(--ion-color-dark);
}

ion-action-sheet.my-custom-class .action-sheet-cancel {
  color: var(--ion-color-secondary); /* Custom color for cancel button text */
}


</style>
