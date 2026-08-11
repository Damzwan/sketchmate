<template>
  <CatalogPickerModal
    :is-open="isOpen"
    title="World"
    :user="user"
    :preview-customization="previewCustomization"
    :preview-mode="previewMode"
    :selection-locked="selectionLocked"
    :selection-name="selectionName"
    :purchasing="purchasing"
    apply-label="Apply World"
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
        v-for="world in visibleWorlds"
        :key="world.id"
        class="rounded-[2rem] h-28 text-left"
        :selected="localSelection === world.id"
        :owned="isItemOwned(world.id)"
        @select="localSelection = world.id"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200">
          <ProfileWorld :def="world" :preview="true" />
        </div>

        <div class="absolute inset-x-0 bottom-0 bg-white/85 backdrop-blur-sm px-3 py-2">
          <p class="text-xs font-black uppercase tracking-wider text-black leading-none">
            {{ world.name }}
          </p>
          <p class="text-xs text-black/70 italic leading-tight mt-0.5">
            {{ world.desc }}
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
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import { useCatalogPicker } from "@/composables/profile/useCatalogPicker";
import {
	type Customization,
	DEFAULT_WORLD_ID,
	WORLDS,
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
	visibleItems: visibleWorlds,
	isItemOwned,
	selectionLocked,
	selectionName,
	purchasing,
	confirm,
	unlock,
} = useCatalogPicker({
	isOpen: () => props.isOpen,
	initialId: () => props.customization.worldId || DEFAULT_WORLD_ID,
	items: WORLDS,
	category: "world",
	idOf: (world) => world.id,
	nameOf: (world) => world.name,
	alwaysOwned: (id) => id === "none",
	isVisible: (world, owned) => !world.exclusive || owned,
	onSelect: (id) => emit("select", id),
	onClose: () => emit("close"),
});

const previewCustomization = computed(() => ({
	...props.customization,
	worldId: localSelection.value,
}));

const handleDismiss = () => emit("close");
</script>
