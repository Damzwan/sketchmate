<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    title="Avatar Decoration"
    subtitle="A frame for your face"
    @close="handleDismiss"
  >
    <template #sub-header>
      <div class="px-3">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
      </div>
    </template>

    <div
      data-content-scroll="true"
      @touchmove.stop
      class="grid grid-cols-3 gap-3 pb-4"
    >
      <button
        v-for="dec in DECORATIONS"
        :key="dec.id"
        class="relative rounded-[2rem] border-2 bg-tertiary p-3 active:scale-95 transition-all overflow-hidden flex flex-col items-center gap-2 text-left"
        :class="
          localSelection === dec.id
            ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
            : 'border-primary/40 shadow-sm'
        "
        @click="localSelection = dec.id"
      >
        <div class="relative w-16 h-16 shrink-0">
          <div class="absolute inset-0 rounded-[1.25rem] border-2 border-white bg-zinc-200 overflow-hidden">
            <img
              v-if="user?.img"
              :src="user.img"
              alt=""
              class="w-full h-full object-cover"
            />
          </div>
          <AvatarDecoration :def="dec" />
        </div>

        <div class="text-center min-h-[2rem]">
          <p class="text-[11px] font-black uppercase tracking-wider text-black leading-tight">
            {{ dec.name }}
          </p>
          <p class="text-[9px] text-black/40 italic leading-tight mt-0.5">
            {{ dec.desc }}
          </p>
        </div>

        <div
          v-if="!isItemOwned(dec.id)"
          class="absolute inset-0 bg-black/25 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
        >
          <div class="bg-white/95 rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
            <ion-icon :icon="svg(mdiLock)" class="text-sm text-black/70" />
          </div>
        </div>

        <div
          v-else-if="localSelection === dec.id"
          class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-secondary shadow-lg flex items-center justify-center"
        >
          <ion-icon :icon="svg(mdiCheck)" class="text-white text-xs" />
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
          Apply Decoration
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
	DECORATIONS,
	DEFAULT_DECORATION_ID,
	type Customization,
} from "@/config/profile_options.config";
import { buildItemId } from "@/config/catalog.config";
import { useInventoryStore } from "@/store/inventory.store";
import { useUnlockItem } from "@/composables/shop/useUnlockItem";
import AvatarDecoration from "./AvatarDecoration.vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
}>();

const emit = defineEmits(["close", "select"]);

const inventoryStore = useInventoryStore();
const { purchasing, unlockItem } = useUnlockItem();

const localSelection = ref(
	props.customization.decorationId || DEFAULT_DECORATION_ID,
);

const isItemOwned = (decorationId: string) => {
	if (decorationId === "none") return true;
	return inventoryStore.isOwned(buildItemId("decoration", decorationId));
};

const selectionLocked = computed(() => !isItemOwned(localSelection.value));
const selectionName = computed(
	() => DECORATIONS.find((d) => d.id === localSelection.value)?.name || "",
);

watch(
	() => props.isOpen,
	(open) => {
		if (open)
			localSelection.value =
				props.customization.decorationId || DEFAULT_DECORATION_ID;
	},
);

const previewCustomization = computed(() => ({
	...props.customization,
	decorationId: localSelection.value,
}));

const confirm = () => {
	if (selectionLocked.value) return unlock();
	emit("select", localSelection.value);
	emit("close");
};

const unlock = async () => {
	const ok = await unlockItem(buildItemId("decoration", localSelection.value));
	if (ok) {
		emit("select", localSelection.value);
		emit("close");
	}
};

const handleDismiss = () => emit("close");
</script>

<style scoped>
/* BaseSheetModal handles scrolling and styles seamlessly */
</style>