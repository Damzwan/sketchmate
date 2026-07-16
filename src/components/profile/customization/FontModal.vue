<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    title="Font"
    @close="handleDismiss"
  >
    <template #sub-header>
      <div class="px-3">
        <PreviewSurfacePager
          :user="user"
          :customization="previewCustomization"
          :active="isOpen"
          :pane-height="280"
          :card-zoom="0.45"
          :post-zoom="0.6"
          :chat-zoom="0.95"
        />
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
        class="relative rounded-[2rem] cursor-pointer border-2 bg-tertiary p-4 active:scale-95 transition-all overflow-hidden text-left"
        :class="[
          localSelection === f.value
            ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
            : 'border-primary/40 shadow-sm',
          !isItemOwned(f.value) && 'locked-tile'
        ]"
        @click="localSelection = f.value"
      >
        <span class="block text-2xl font-bold leading-tight truncate" :style="{ fontFamily: f.family }">
          {{ f.preview }}
        </span>
        <span class="block text-xs font-black uppercase tracking-widest text-black/70 mt-2">
          {{ f.label }}
        </span>

        <div
          v-if="!isItemOwned(f.value)"
          class="absolute inset-0 bg-black/25 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
        >
          <div class="bg-white/95 rounded-full w-9 h-9 flex items-center justify-center shadow-lg">
            <ion-icon :icon="svg(mdiLock)" class="text-base text-black/70" />
          </div>
        </div>

        <div
          v-if="localSelection === f.value && isItemOwned(f.value)"
          class="absolute top-2 right-2 w-6 h-6 rounded-full bg-secondary shadow-lg flex items-center justify-center"
        >
          <ion-icon :icon="svg(mdiCheck)" class="text-white text-sm" />
        </div>
      </button>
    </div>

    <template #footer>
      <div class="px-1 pt-2 pb-1 bg-background">
        <ion-button
          v-if="selectionLocked"
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          :disabled="purchasing"
          @click="unlock"
        >
          <ion-icon :icon="svg(mdiLock)" slot="start" class="mr-1" />
          {{ purchasing ? 'Unlocking…' : `Unlock ${selectionName}` }}
        </ion-button>
        <ion-button
          v-else
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
import { mdiCheck, mdiLock } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import {
	DEFAULT_FONT_ID,
	FONTS,
	type Customization,
} from "@/config/profile_options.config";
import { buildItemId } from "@/config/catalog.config";
import { useInventoryStore } from "@/store/inventory.store";
import { useUnlockItem } from "@/composables/shop/useUnlockItem";
import PreviewSurfacePager from "@/components/profile/PreviewSurfacePager.vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
}>();

const emit = defineEmits(["close", "select"]);

const inventoryStore = useInventoryStore();
const { purchasing, unlockItem } = useUnlockItem();

const localSelection = ref(props.customization.fontId || DEFAULT_FONT_ID);

watch(
	() => props.isOpen,
	(open) => {
		if (open)
			localSelection.value = props.customization.fontId || DEFAULT_FONT_ID;
	},
);

const isItemOwned = (fontId: string) =>
	inventoryStore.isOwned(buildItemId("font", fontId));

const selectionLocked = computed(() => !isItemOwned(localSelection.value));

const selectionName = computed(
	() => FONTS.find((f) => f.value === localSelection.value)?.label || "",
);

const previewCustomization = computed(() => ({
	...props.customization,
	fontId: localSelection.value,
}));

const confirm = () => {
	if (selectionLocked.value) return unlock();
	emit("select", localSelection.value);
	emit("close");
};

const unlock = async () => {
	const ok = await unlockItem(buildItemId("font", localSelection.value));
	if (ok) {
		emit("select", localSelection.value);
		emit("close");
	}
};

const handleDismiss = () => emit("close");
</script>

<style scoped>
.locked-tile { opacity: 0.92; }
</style>
