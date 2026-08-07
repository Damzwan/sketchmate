<template>
  <ion-popover trigger="font" @willDismiss="onDismiss" @willPresent="onPresent" :showBackdrop="false"
               :is-open="fontMenuOpen" :event="menuEvent">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" v-for="font in FONTS" :key="font" @click="selectFont(font)">
          <p class="pl-2 text-base" :style="{ fontFamily: font }">{{ font }}</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonItem, IonList, IonPopover } from "@ionic/vue";
import { IText } from "fabric";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { FONTS } from "@/draw/config/fonts.config";
import { useDrawStore } from "@/draw/session/draw.store";
import { useSelect } from "@/draw/tools/select.store";
import { useMenuStore } from "@/store/menu.store";

const { selectedObjectsRef } = storeToRefs(useSelect());
const text = computed(() => selectedObjectsRef.value[0] as IText);

const shouldRefocusTextAfterClose = ref(false);

const { fontMenuOpen, menuEvent } = storeToRefs(useMenuStore());

function selectFont(font: string) {
	const { selectAction } = useDrawStore();
	selectAction(DrawAction.ChangeFont, { font });
}

function onPresent() {
	const { getCanvas } = useDrawStore();
	const { isEditingText } = useSelect();
	if (isEditingText) {
		shouldRefocusTextAfterClose.value = true;
		if (text.value.text != "") getCanvas().discardActiveObject(); // TODO needed to activate history
	}
}

function onDismiss() {
	shouldRefocusTextAfterClose.value = false;
	fontMenuOpen.value = false;
}
</script>

<style scoped>
ion-list {
  padding: 0;
}
</style>
