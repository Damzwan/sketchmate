<template>
  <CatalogPickerModal
    :is-open="isOpen"
    :title="previewMode === 'chat' ? 'Chat Effect' : 'Profile Effect'"
    :user="user"
    :preview-customization="previewCustomization"
    :preview-mode="previewMode"
    :selection-locked="selectionLocked"
    :selection-name="selectionName"
    :purchasing="purchasing"
    apply-label="Apply Effect"
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
        v-for="effect in visibleEffects"
        :key="effect.id"
        class="rounded-[2rem] h-28 text-left"
        :selected="localSelection === effect.id"
        :owned="isItemOwned(effect.id)"
        @select="localSelection = effect.id"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200">
          <ProfileEffect :def="effect" :preview="true" />
        </div>

        <div class="absolute inset-x-0 bottom-0 bg-white/85 backdrop-blur-sm px-3 py-2">
          <p class="text-xs font-black uppercase tracking-wider text-black leading-none">
            {{ effect.name }}
          </p>
          <p class="text-xs text-black/70 italic leading-tight mt-0.5">
            {{ effect.desc }}
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
	DEFAULT_EFFECT_ID,
	PROFILE_EFFECTS,
} from "@/config/profile_options.config";
import type { User } from "@/types/server.types";
import ProfileEffect from "./ProfileEffect.vue";

const props = defineProps<{
	isOpen: boolean;
	user?: User;
	customization: Partial<Customization>;
	previewMode?: "profile" | "chat";
}>();

const emit = defineEmits<{ close: []; select: [id: string] }>();

const {
	localSelection,
	visibleItems: visibleEffects,
	isItemOwned,
	selectionLocked,
	selectionName,
	purchasing,
	confirm,
	unlock,
} = useCatalogPicker({
	isOpen: () => props.isOpen,
	initialId: () => props.customization.effectId || DEFAULT_EFFECT_ID,
	items: PROFILE_EFFECTS,
	category: "effect",
	idOf: (effect) => effect.id,
	nameOf: (effect) => effect.name,
	isVisible: (effect, owned) => !effect.exclusive || owned,
	onSelect: (id) => emit("select", id),
	onClose: () => emit("close"),
});

const previewCustomization = computed(() => ({
	...props.customization,
	effectId: localSelection.value,
}));

const handleDismiss = () => emit("close");
</script>
