<template>
  <BaseSheetModal
    :is-open="isOpen"
    @close="handleDismiss"
    scrollable
  >
    <template #header>
      <div class="shrink-0 pt-0 mb-1 text-center">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">Font</h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-1">
          The voice of your name
        </p>
      </div>

      <div class="shrink-0 px-3 mb-2">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
      </div>
    </template>

    <div
      data-content-scroll="true"
      @touchmove.stop
      class="grid grid-cols-2 gap-3 pb-4"
    >
      <button
        v-for="f in FONTS"
        :key="f.value"
        class="relative rounded-[2rem] border-2 bg-white/60 p-4 active:scale-95 transition-all overflow-hidden text-left"
        :class="
          localSelection === f.value
            ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
            : 'border-white shadow-sm'
        "
        @click="localSelection = f.value"
      >
        <span class="block text-2xl font-bold leading-tight truncate" :style="{ fontFamily: f.family }">
          {{ f.preview }}
        </span>
        <span class="block text-[9px] font-black uppercase tracking-widest text-black/40 mt-2">
          {{ f.label }}
        </span>

        <div
          v-if="localSelection === f.value"
          class="absolute top-2 right-2 w-6 h-6 rounded-full bg-secondary shadow-lg flex items-center justify-center"
        >
          <ion-icon :icon="svg(mdiCheck)" class="text-white text-sm" />
        </div>
      </button>
    </div>

    <template #footer>
      <div class="px-1 pt-2 pb-1 bg-background">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="confirm"
        >
          Apply Font
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import {
	DEFAULT_FONT_ID,
	FONTS,
	type Customization,
} from "@/config/profile_options.config";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
}>();

const emit = defineEmits(["close", "select"]);

const localSelection = ref(props.customization.fontId || DEFAULT_FONT_ID);

watch(
	() => props.isOpen,
	(open) => {
		if (open)
			localSelection.value = props.customization.fontId || DEFAULT_FONT_ID;
	},
);

const previewCustomization = computed(() => ({
	...props.customization,
	fontId: localSelection.value,
}));

const confirm = () => {
	emit("select", localSelection.value);
	emit("close");
};
const handleDismiss = () => emit("close");
</script>

<style scoped>
/* Scoped styles clean and lean since everything is managed by BaseSheetModal */
</style>