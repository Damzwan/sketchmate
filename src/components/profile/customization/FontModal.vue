<template>
  <CatalogPickerModal
    :is-open="isOpen"
    title="Font"
    :user="user"
    :preview-customization="previewCustomization"
    :preview-mode="previewMode"
    :selection-locked="selectionLocked"
    :selection-name="selectionName"
    :purchasing="purchasing"
    apply-label="Apply Font"
    @close="handleDismiss"
    @apply="confirm"
    @unlock="unlock"
  >
    <div
      data-content-scroll="true"
      @touchmove.stop
      class="grid grid-cols-2 gap-3 pb-4"
    >
      <CatalogPickerTile
        v-for="f in FONTS"
        :key="f.value"
        class="rounded-[2rem] p-4 text-left"
        :selected="localSelection === f.value"
        :owned="isItemOwned(f.value)"
        @select="localSelection = f.value"
      >
        <span class="block text-2xl font-bold leading-tight truncate" :style="{ fontFamily: f.family }">
          {{ f.preview }}
        </span>
        <span class="block text-xs font-black uppercase tracking-widest text-black/70 mt-2">
          {{ f.label }}
        </span>

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
	DEFAULT_FONT_ID,
	FONTS,
} from "@/config/profile_options.config";
import type { User } from "@/types/server.types";

const props = defineProps<{
	isOpen: boolean;
	user?: User;
	customization: Partial<Customization>;
	previewMode?: "profile" | "chat";
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
	initialId: () => props.customization.fontId || DEFAULT_FONT_ID,
	items: FONTS,
	category: "font",
	idOf: (font) => font.value,
	nameOf: (font) => font.label,
	onSelect: (id) => emit("select", id),
	onClose: () => emit("close"),
});

const previewCustomization = computed(() => ({
	...props.customization,
	fontId: localSelection.value,
}));

const handleDismiss = () => emit("close");
</script>
