<template>
  <ion-popover @willDismiss="onDismiss" @willPresent="onPresent" :showBackdrop="false" :event="menuEvent"
               :is-open="textMenuOpen">
    <ion-content v-if="text" class="bg-background">
      <ion-list lines="none" class="divide-y divide-primary">
        <ion-item color="tertiary">
          <div class="flex justify-between w-full">
            <div class="button_group">
              <div
                :class="{ 'bg-primary-shade': isBold }"
                @click="selectAction(DrawAction.ChangeFontWeight, { weight: isBold ? 'normal' : 'bold' })"
              >
                <ion-icon :icon="svg(mdiFormatBold)" />
              </div>

              <div
                :class="{ 'bg-primary-shade': isItalic }"
                @click="selectAction(DrawAction.ChangeFontStyle, { fontStyle: isItalic ? 'normal' : 'italic' })"
              >
                <ion-icon :icon="svg(mdiFormatItalic)" />
              </div>


            </div>

            <div class="button_group">
              <div
                :class="{ 'bg-primary-shade': align === TextAlign.left }"
                @click="selectAction(DrawAction.ChangeTextAlign, { align: TextAlign.left })"
              >
                <ion-icon :icon="svg(mdiFormatAlignLeft)" />
              </div>

              <div
                :class="{ 'bg-primary-shade': align === TextAlign.center }"
                @click="selectAction(DrawAction.ChangeTextAlign, { align: TextAlign.center })"
              >
                <ion-icon :icon="svg(mdiFormatAlignCenter)" />
              </div>

              <div
                :class="{ 'bg-primary-shade': align === TextAlign.right }"
                @click="selectAction(DrawAction.ChangeTextAlign, { align: TextAlign.right })"
              >
                <ion-icon :icon="svg(mdiFormatAlignRight)" />
              </div>
            </div>
          </div>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { svg } from "@/helper/general.helper";
import {
	mdiFormatAlignCenter,
	mdiFormatAlignLeft,
	mdiFormatAlignRight,
	mdiFormatBold,
	mdiFormatItalic,
} from "@mdi/js";
import { IonContent, IonIcon, IonItem, IonList, IonPopover } from "@ionic/vue";
import { useDrawStore } from "@/draw/session/draw.store";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { TextAlign } from "@/draw/tools/tool.types";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useMenuStore } from "@/store/menu.store";
import { useSelect } from "@/draw/tools/select.store";

import { IText } from "fabric";

const { selectAction } = useDrawStore();
const { selectedObjectsRef } = storeToRefs(useSelect());

const text = computed(() => selectedObjectsRef.value[0] as IText);
const isBold = computed(
	() => (selectedObjectsRef.value[0] as IText).fontWeight === "bold",
);
const isItalic = computed(
	() => (selectedObjectsRef.value[0] as IText).fontStyle === "italic",
);
const align = computed(() => (selectedObjectsRef.value[0] as IText).textAlign);

const { textMenuOpen, menuEvent } = storeToRefs(useMenuStore());

const shouldRefocusTextAfterClose = ref(false);

function onDismiss() {
	shouldRefocusTextAfterClose.value = false;
	textMenuOpen.value = false;
}

function onPresent() {
	const { isEditingText } = useSelect();
	const { getCanvas } = useDrawStore();
	if (isEditingText) {
		shouldRefocusTextAfterClose.value = true;
		if (text.value.text != "") getCanvas().discardActiveObject(); // TODO needed to activate history
	}
}
</script>

<style scoped>
@reference "@/theme/main.css";
.button_group {
  @apply flex h-10 divide-x divide-black border border-black rounded-xl overflow-hidden bg-primary;
}

.button_group div {
  @apply w-10 h-10 flex justify-center items-center  cursor-pointer;
}

.button_group div ion-icon {
  @apply w-6 h-6;
}

ion-popover {
  --width: 300px; /* Set this to the desired width */
}

ion-list {
  padding: 0;
}
</style>
