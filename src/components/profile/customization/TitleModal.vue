<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    @close="handleDismiss"
  >
    <template #header>
      <div class="shrink-0 pt-0 mb-1 text-center">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Artist Title
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-1">
          Your Earned Honors
        </p>
      </div>
    </template>

    <div
      data-content-scroll="true"
      @touchmove.stop
      class="space-y-3 pb-4"
    >
      <div
        v-for="title in TITLES"
        :key="title.id"
        class="group relative flex items-center gap-4 p-4 rounded-[2rem] border transition-all duration-300 active:scale-[0.97]"
        :class="localSelection === title.id
          ? 'bg-white border-secondary shadow-md'
          : 'bg-white/40 border-white shadow-sm hover:bg-white/60'"
        @click="localSelection = localSelection === title.id ? '' : title.id"
      >
        <div
          class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-all"
          :class="localSelection === title.id ? 'bg-secondary/10' : 'bg-white/80 shadow-inner'"
        >
          {{ title.emoji }}
        </div>

        <div class="flex-1 min-w-0">
          <span
            class="font-black text-lg leading-none block"
            :class="localSelection === title.id ? 'text-secondary' : 'text-black'"
          >
            {{ title.name }}
          </span>
          <p class="text-[11px] font-bold text-black/40 mt-1 leading-tight italic">
            {{ title.desc }}
          </p>
        </div>

        <div
          class="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
          :class="localSelection === title.id ? 'bg-secondary border-secondary shadow-lg' : 'border-black/5 bg-black/5'"
        >
          <ion-icon v-if="localSelection === title.id" :icon="svg(mdiCheck)" class="text-white text-lg" />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="px-1 pt-2 pb-1 bg-background">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="confirmSelection"
        >
          Confirm Title
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { TITLES } from "../../../config/profile_options.config";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";

const props = defineProps<{
	isOpen: boolean;
	currentTitleId: string;
}>();

const emit = defineEmits(["close", "select"]);

const localSelection = ref(props.currentTitleId);

watch(
	() => props.isOpen,
	(open) => {
		if (open) localSelection.value = props.currentTitleId;
	},
);

const confirmSelection = () => {
	emit("select", localSelection.value);
	emit("close");
};

const handleDismiss = () => {
	emit("close");
};
</script>

<style scoped>
/* No internal alignment overrides needed anymore! */
</style>