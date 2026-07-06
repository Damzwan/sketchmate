<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    title="Profile Effect"
    subtitle="A little motion for your card"
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
        v-for="effect in PROFILE_EFFECTS"
        :key="effect.id"
        class="relative rounded-[2rem] border-2 bg-tertiary active:scale-95 transition-all overflow-hidden h-28 text-left"
        :class="[
          localSelection === effect.id
            ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
            : 'border-primary/40 shadow-sm',
          !isItemOwned(effect.id) && 'locked-tile'
        ]"
        @click="handleSelect(effect)"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200">
          <ProfileEffect :def="effect" :preview="true" />
        </div>

        <div
          v-if="!isItemOwned(effect.id)"
          class="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
        >
          <div class="bg-white/95 rounded-full w-9 h-9 flex items-center justify-center shadow-lg">
            <ion-icon :icon="svg(mdiLock)" class="text-base text-black/70" />
          </div>
        </div>

        <div class="absolute inset-x-0 bottom-0 bg-white/85 backdrop-blur-sm px-3 py-2">
          <p class="text-[11px] font-black uppercase tracking-wider text-black leading-none">
            {{ effect.name }}
          </p>
          <p class="text-[9px] text-black/50 italic leading-tight mt-0.5">
            {{ effect.desc }}
          </p>
        </div>

        <div
          v-if="localSelection === effect.id && isItemOwned(effect.id)"
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
          Apply Effect
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
	DEFAULT_EFFECT_ID,
	PROFILE_EFFECTS,
	type Customization,
	type ProfileEffectDef,
} from "@/config/profile_options.config";
import { buildItemId } from "@/config/catalog.config";
import { useInventoryStore } from "@/store/inventory.store";
import { useUnlockItem } from "@/composables/shop/useUnlockItem";
import ProfileEffect from "./ProfileEffect.vue";
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

const localSelection = ref(props.customization.effectId || DEFAULT_EFFECT_ID);

watch(
	() => props.isOpen,
	(open) => {
		if (open)
			localSelection.value = props.customization.effectId || DEFAULT_EFFECT_ID;
	},
);

const isItemOwned = (effectId: string) =>
	inventoryStore.isOwned(buildItemId("effect", effectId));

const selectionLocked = computed(() => !isItemOwned(localSelection.value));

const selectionName = computed(
	() => PROFILE_EFFECTS.find((e) => e.id === localSelection.value)?.name || "",
);

const previewCustomization = computed(() => ({
	...props.customization,
	effectId: localSelection.value,
}));

const handleSelect = (effect: ProfileEffectDef) => {
	localSelection.value = effect.id;
};

const confirm = () => {
	if (selectionLocked.value) return unlock();
	emit("select", localSelection.value);
	emit("close");
};

const unlock = async () => {
	const ok = await unlockItem(buildItemId("effect", localSelection.value));
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