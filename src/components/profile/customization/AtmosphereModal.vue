<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    @close="handleDismiss"
  >
    <template #header>
      <div class="shrink-0 pt-0 mb-1 text-center">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Atmosphere
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-1">
          Environment for your card
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
        v-for="atmos in ATMOSPHERES"
        :key="atmos.id"
        class="relative rounded-[2rem] border-2 bg-white/60 active:scale-95 transition-all overflow-hidden h-28 text-left"
        :class="[
          localSelection === atmos.id
            ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
            : 'border-white shadow-sm',
          !isItemOwned(atmos.id) && 'locked-tile'
        ]"
        @click="handleSelect(atmos)"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200">
          <ProfileAtmosphere :def="atmos" :preview="true" />
        </div>

        <div
          v-if="!isItemOwned(atmos.id)"
          class="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
        >
          <div class="bg-white/95 rounded-full w-9 h-9 flex items-center justify-center shadow-lg">
            <ion-icon :icon="svg(mdiLock)" class="text-base text-black/70" />
          </div>
        </div>

        <div class="absolute inset-x-0 bottom-0 bg-white/85 backdrop-blur-sm px-3 py-2">
          <p class="text-[11px] font-black uppercase tracking-wider text-black leading-none">
            {{ atmos.name }}
          </p>
          <p class="text-[9px] font-bold text-black/50 italic leading-tight mt-0.5">
            {{ atmos.desc }}
          </p>
        </div>

        <div
          v-if="localSelection === atmos.id && isItemOwned(atmos.id)"
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
          @click="goToShop"
        >
          <ion-icon :icon="svg(mdiLock)" slot="start" class="mr-1" />
          Unlock {{ selectionName }}
        </ion-button>
        <ion-button
          v-else
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="confirm"
        >
          Apply Atmosphere
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
	DEFAULT_ATMOSPHERE_ID,
	ATMOSPHERES,
	type Customization,
	type AtmosphereDef,
} from "@/config/profile_options.config";
import { buildItemId } from "@/config/catalog.config";
import { useInventoryStore } from "@/store/inventory.store";
import { useMenuStore } from "@/store/menu.store";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import ProfileAtmosphere from "@/components/profile/ProfileAtmosphere.vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
}>();

const emit = defineEmits(["close", "select"]);

const inventoryStore = useInventoryStore();
const menuStore = useMenuStore();

const localSelection = ref(
	props.customization.atmosphereId || DEFAULT_ATMOSPHERE_ID,
);

watch(
	() => props.isOpen,
	(open) => {
		if (open)
			localSelection.value =
				props.customization.atmosphereId || DEFAULT_ATMOSPHERE_ID;
	},
);

const isItemOwned = (atmosphereId: string) => {
	if (atmosphereId === "none") return true;
	return inventoryStore.isOwned(buildItemId("atmosphere", atmosphereId));
};

const selectionLocked = computed(() => !isItemOwned(localSelection.value));
const selectionName = computed(
	() => ATMOSPHERES.find((a) => a.id === localSelection.value)?.name || "",
);

const previewCustomization = computed(() => ({
	...props.customization,
	atmosphereId: localSelection.value,
}));

const handleSelect = (atmos: AtmosphereDef) => {
	localSelection.value = atmos.id;
};

const confirm = () => {
	if (selectionLocked.value) return goToShop();
	emit("select", localSelection.value);
	emit("close");
};

const goToShop = () => {
	const itemId = buildItemId("atmosphere", localSelection.value);
	emit("close");
	setTimeout(() => menuStore.openShop(itemId), 250);
};

const handleDismiss = () => emit("close");
</script>

<style scoped>
.locked-tile { opacity: 0.92; }
</style>