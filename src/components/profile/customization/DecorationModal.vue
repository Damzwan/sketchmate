<template>
  <CatalogPickerModal
    :is-open="isOpen"
    title="Avatar Decoration"
    :user="user"
    :preview-customization="previewCustomization"
    :selection-locked="selectionLocked"
    :selection-name="selectionName"
    :purchasing="purchasing"
    apply-label="Apply Decoration"
    @close="handleDismiss"
    @apply="confirm"
    @unlock="unlock"
  >
    <div
      data-content-scroll="true"
      @touchmove.stop
      class="grid grid-cols-3 gap-3 pb-4"
    >
      <CatalogPickerTile
        v-for="dec in DECORATIONS"
        :key="dec.id"
        class="rounded-[2rem] p-3 flex flex-col items-center gap-2 text-left"
        :selected="localSelection === dec.id"
        :owned="isItemOwned(dec.id)"
        @select="localSelection = dec.id"
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
          <p class="text-xs font-black uppercase tracking-wider text-black leading-tight">
            {{ dec.name }}
          </p>
          <p class="text-xs text-black/70 italic leading-tight mt-0.5">
            {{ dec.desc }}
          </p>
        </div>

      </CatalogPickerTile>
    </div>

  </CatalogPickerModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CatalogPickerModal from "@/components/profile/customization/CatalogPickerModal.vue";
import CatalogPickerTile from "@/components/profile/customization/CatalogPickerTile.vue";
import { useCatalogPicker } from "@/composables/profile/useCatalogPicker";
import {
	type Customization,
	DECORATIONS,
	DEFAULT_DECORATION_ID,
} from "@/config/profile_options.config";
import type { User } from "@/types/server.types";
import AvatarDecoration from "./AvatarDecoration.vue";

const props = defineProps<{
	isOpen: boolean;
	user?: User;
	customization: Partial<Customization>;
}>();

const emit = defineEmits<{ close: []; select: [id: string] }>();

const {
	localSelection,
	isItemOwned,
	selectionLocked,
	selectionName,
	purchasing,
	confirm,
	unlock,
} = useCatalogPicker({
	isOpen: () => props.isOpen,
	initialId: () => props.customization.decorationId || DEFAULT_DECORATION_ID,
	items: DECORATIONS,
	category: "decoration",
	idOf: (decoration) => decoration.id,
	nameOf: (decoration) => decoration.name,
	alwaysOwned: (id) => id === "none",
	onSelect: (id) => emit("select", id),
	onClose: () => emit("close"),
});

const previewCustomization = computed(() => ({
	...props.customization,
	decorationId: localSelection.value,
}));

const handleDismiss = () => emit("close");
</script>

<style scoped>
/* BaseSheetModal handles scrolling and styles seamlessly */
</style>
