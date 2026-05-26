<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-customize-modal"
  >
    <div class="h-full flex flex-col bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">
      <!-- Header -->
      <div class="shrink-0 pt-4 pb-2 text-center">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">Theme</h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          A curated look for your profile
        </p>
      </div>

      <!-- Live Preview -->
      <div class="shrink-0 px-4 mb-2">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
      </div>

      <!-- Theme Grid -->
      <div class="flex-1 overflow-y-auto px-5 hide-scrollbar pb-4" @touchmove.stop>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="theme in THEMES"
            :key="theme.id"
            class="relative rounded-[2rem] border-2 p-4 text-left active:scale-95 transition-all overflow-hidden"
            :class="[
              localSelection === theme.id
                ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
                : 'border-white shadow-sm',
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

            <!-- Lock veil — dims the tile but keeps the preview readable -->
            <div
              v-if="!isItemOwned(theme.id)"
              class="absolute inset-0 bg-black/25 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
            >
              <div class="bg-white/95 rounded-full w-9 h-9 flex items-center justify-center shadow-lg">
                <ion-icon :icon="svg(mdiLock)" class="text-base text-black/70" />
              </div>
            </div>

            <!-- Checkmark only on owned + selected tile -->
            <div
              v-if="localSelection === theme.id && isItemOwned(theme.id)"
              class="absolute top-2 right-2 w-7 h-7 rounded-full bg-secondary shadow-lg flex items-center justify-center"
            >
              <ion-icon :icon="svg(mdiCheck)" class="text-white text-base" />
            </div>
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="px-5 pt-3 pb-2 shrink-0 bg-background border-t border-black/5">
        <!-- Locked selection → Unlock CTA -->
        <ion-button
          v-if="selectionLocked"
          expand="block"
          color="secondary"
          shape="round"
          class="h-14 font-black uppercase tracking-widest shadow-lg"
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
          class="h-14 font-black uppercase tracking-widest shadow-lg"
          @click="confirm"
        >
          Apply Theme
        </ion-button>

        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="font-black uppercase tracking-widest text-xs mt-1 opacity-60"
          @click="handleDismiss"
        >
          Cancel
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import { mdiCheck, mdiLock } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { THEMES, type Customization } from "@/config/profile_options.config";
import { buildItemId } from "@/config/catalog.config";
import { useInventoryStore } from "@/store/inventory.store";
import { useMenuStore } from "@/store/menu.store";
import PreviewProfileCard from "../PreviewProfileCard.vue";

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
}>();

const emit = defineEmits(["close", "select"]);

const inventoryStore = useInventoryStore();
const menuStore = useMenuStore();

const localSelection = ref(props.customization.themeId || "classic");

watch(
	() => props.isOpen,
	(open) => {
		if (open) localSelection.value = props.customization.themeId || "classic";
	},
);

// Themes use the "theme.<id>" item ID convention
const isItemOwned = (themeId: string) =>
	inventoryStore.isOwned(buildItemId("theme", themeId));

const selectionLocked = computed(() => !isItemOwned(localSelection.value));

const selectionName = computed(
	() => THEMES.find((t) => t.id === localSelection.value)?.name || "",
);

// Compose preview customization by merging the current full customization
// with the locally previewed theme — keeps decoration/effect/title visible
// while the user shops themes. Even locked themes preview live so they see
// what they're missing.
const previewCustomization = computed(() => ({
	...props.customization,
	themeId: localSelection.value,
}));

const confirm = () => {
	if (selectionLocked.value) return goToShop();
	emit("select", localSelection.value);
	emit("close");
};

const goToShop = () => {
	const itemId = buildItemId("theme", localSelection.value);
	emit("close");
	// Slight delay so the modal dismisses cleanly before the shop opens
	setTimeout(() => menuStore.openShop(itemId), 250);
};

const handleDismiss = () => emit("close");
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.locked-tile { opacity: 0.92; }

ion-modal.liquid-customize-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: 90%;
  --background: var(--ion-color-tertiary);
}
ion-modal.liquid-customize-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>