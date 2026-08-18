<template>
  <CatalogPickerModal
    :is-open="isOpen"
    title="Theme"
    :user="user"
    :preview-customization="previewCustomization"
    :preview-mode="previewMode"
    :selection-locked="selectionLocked"
    :selection-name="selectionName"
    :purchasing="purchasing"
    apply-label="Apply Theme"
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
        v-for="theme in THEMES"
        :key="theme.id"
        class="rounded-[2rem] p-4 text-left"
        :selected="localSelection === theme.id"
        :owned="isItemOwned(theme.id)"
        :style="{ background: theme.cardBg }"
        @select="localSelection = theme.id"
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
        <p class="text-xs font-bold italic mt-1 leading-tight" :style="{ color: theme.descColor }">
          {{ theme.desc }}
        </p>

      </CatalogPickerTile>
    </div>

  </CatalogPickerModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CatalogPickerModal from "@/components/profile/customization/CatalogPickerModal.vue";
import CatalogPickerTile from "@/components/profile/customization/CatalogPickerTile.vue";
import { useCatalogPicker } from "@/composables/profile/useCatalogPicker";
import { type Customization, THEMES } from "@/config/profile_options.config";
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
	initialId: () => props.customization.themeId || "classic",
	items: THEMES,
	category: "theme",
	idOf: (theme) => theme.id,
	nameOf: (theme) => theme.name,
	onSelect: (id) => emit("select", id),
	onClose: () => emit("close"),
});

const previewCustomization = computed(() => ({
	...props.customization,
	themeId: localSelection.value,
}));

const handleDismiss = () => emit("close");
</script>
