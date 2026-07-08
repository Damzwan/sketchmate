<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    title="Theme"
    subtitle="A curated look for your profile"
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
      class="grid grid-cols-2 gap-3 pb-4"
    >
      <button
        v-for="theme in THEMES"
        :key="theme.id"
        class="relative rounded-[2rem] cursor-pointer border-2 p-4 text-left active:scale-95 transition-all overflow-hidden"
        :class="[
          localSelection === theme.id
            ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
            : 'border-primary/40 shadow-sm',
          !isItemOwned(theme.id) && 'locked-tile'
        ]"
        :style="{ background: theme.cardBg }"
        @click="localSelection = theme.id"
      >
        <div class="flex items-center gap-1.5 mb-3">
          <span
            v-for="(c, i) in theme.swatches"
            :key="i"
            class="w-3 h-3 rounded-full border border-white/40"
            :style="{ backgroundColor: c }"
          ></span>
        </div>
        <h3 class="font-black text-lg leading-none" :style="{ color: theme.nameColor }">
          {{ theme.name }}
        </h3>
        <p class="text-[11px] font-bold italic mt-1 leading-tight" :style="{ color: theme.descColor }">
          {{ theme.desc }}
        </p>

        <div
          v-if="!isItemOwned(theme.id)"
          class="absolute inset-0 bg-black/25 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
        >
          <div class="bg-white/95 rounded-full w-9 h-9 flex items-center justify-center shadow-lg">
            <ion-icon :icon="svg(mdiLock)" class="text-base text-black/70" />
          </div>
        </div>

        <div
          v-if="localSelection === theme.id && isItemOwned(theme.id)"
          class="absolute top-2 right-2 w-7 h-7 rounded-full bg-secondary shadow-lg flex items-center justify-center"
        >
          <ion-icon :icon="svg(mdiCheck)" class="text-white text-base" />
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
          Apply Theme
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
import { THEMES, type Customization } from "@/config/profile_options.config";
import { buildItemId } from "@/config/catalog.config";
import { useInventoryStore } from "@/store/inventory.store";
import { useUnlockItem } from "@/composables/shop/useUnlockItem";
import PreviewProfileCard from "../PreviewProfileCard.vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue"; // Import your base modal

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
}>();

const emit = defineEmits(["close", "select"]);

const inventoryStore = useInventoryStore();
const { purchasing, unlockItem } = useUnlockItem();

const localSelection = ref(props.customization.themeId || "classic");

watch(
	() => props.isOpen,
	(open) => {
		if (open) localSelection.value = props.customization.themeId || "classic";
	},
);

const isItemOwned = (themeId: string) =>
	inventoryStore.isOwned(buildItemId("theme", themeId));

const selectionLocked = computed(() => !isItemOwned(localSelection.value));

const selectionName = computed(
	() => THEMES.find((t) => t.id === localSelection.value)?.name || "",
);

const previewCustomization = computed(() => ({
	...props.customization,
	themeId: localSelection.value,
}));

const confirm = () => {
	if (selectionLocked.value) return unlock();
	emit("select", localSelection.value);
	emit("close");
};

const unlock = async () => {
	const ok = await unlockItem(buildItemId("theme", localSelection.value));
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