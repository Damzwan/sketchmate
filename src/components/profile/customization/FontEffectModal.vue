<template>
  <CatalogPickerModal
    :is-open="isOpen"
    title="Text Effect"
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
    <div data-content-scroll="true" @touchmove.stop class="pb-4">
        <div class="grid grid-cols-2 gap-3">
          <CatalogPickerTile
            v-for="e in FONT_EFFECTS"
            :key="e.value"
            class="rounded-[2rem] p-5 flex flex-col items-center justify-center min-h-[110px]"
            :selected="localSelection === e.value"
            :owned="isItemOwned(e.value)"
            @select="localSelection = e.value"
          >
            <!-- Live demo of the effect using the user's chosen font -->
            <span
              class="block text-3xl font-black leading-none mb-2"
              :class="FONT_EFFECT_MAP[e.value] || ''"
              :style="{ fontFamily: resolvedFontFamily, color: e.value ? undefined : '#18181b' }"
            >
              Aa
            </span>
            <span class="block text-xs font-black uppercase tracking-widest text-black mt-3">
              {{ e.label }}
            </span>
            <span class="block text-xs italic text-black/70 leading-tight mt-0.5">
              {{ e.desc }}
            </span>

          </CatalogPickerTile>
        </div>
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
	FONT_EFFECT_MAP,
	FONT_EFFECTS,
	resolveFontFamily,
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
	initialId: () => props.customization.fontEffectId || "",
	items: FONT_EFFECTS,
	category: "font_effect",
	idOf: (effect) => effect.value,
	nameOf: (effect) => effect.label,
	onSelect: (id) => emit("select", id),
	onClose: () => emit("close"),
});

const previewCustomization = computed(() => ({
	...props.customization,
	fontEffectId: localSelection.value,
}));

// Use the user's chosen font in the swatch previews so the effect/font combo
// is honest about what they'll actually see.
const resolvedFontFamily = computed(() =>
	resolveFontFamily(props.customization.fontId),
);

const handleDismiss = () => emit("close");
</script>
