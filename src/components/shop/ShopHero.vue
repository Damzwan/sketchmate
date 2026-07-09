<template>
  <div
    class="snap-center shrink-0 w-[290px] relative rounded-[2rem] overflow-hidden border border-primary/40 bg-tertiary shadow-sm transition-all duration-200 md:hover:scale-[1.02] md:hover:shadow-md"
    :class="previewable ? 'cursor-pointer' : ''"
    :role="previewable ? 'button' : undefined"
    @click="previewable && $emit('preview')"
  >
    <!-- Live preview backdrop (muted slate — not a flashy neon gradient) -->
    <div class="h-40 relative overflow-hidden hero-stage">
      <ProfileEffect v-if="isEffect && effectDef" :def="effectDef" :preview="true" />
      <ProfileWorld
        v-else-if="isWorld && worldDef"
        :def="worldDef"
        :preview="true"
        :preview-scale="0.55"
      />

      <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-secondary text-white text-[12px] font-black tracking-tight">
        New
      </span>

      <div class="absolute inset-x-0 bottom-0 p-4 pt-10 bg-gradient-to-t from-black/75 to-transparent">
        <h3 class="text-white text-xl font-black leading-none tracking-tight cabin-sketch-regular">{{ sku.name }}</h3>
        <p class="text-white/80 text-[13px] font-bold mt-1 leading-tight">{{ sku.desc }}</p>
      </div>
    </div>

    <div class="px-4 py-2.5 flex items-center justify-between gap-2">
      <span class="text-[14px] font-black tracking-tight text-black/70">{{ categoryLabel }}</span>
      <ion-button
        v-if="!owned"
        color="secondary"
        shape="round"
        size="small"
        class="m-0 tracking-tight"
        @click.stop="$emit('purchase')"
      >
        {{ (sku as any).priceString || 'Unlock' }}
      </ion-button>
      <span v-else class="text-[14px] font-black tracking-tight text-emerald-600 flex items-center gap-1">
        <ion-icon :icon="mdiCheck" class="text-sm" /> Owned
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
import type { ShopSku } from "@/config/catalog.config";
import {
	resolveEffect,
	resolveWorld,
} from "@/config/profile_options.config";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";

const props = defineProps<{ sku: ShopSku; owned: boolean }>();
defineEmits(["purchase", "preview"]);

// Brushes have no profile surface, so nothing to preview.
const previewable = computed(() => props.sku.category !== "brush");
const isEffect = computed(() => props.sku.category === "effect");
const isWorld = computed(() => props.sku.category === "world");
const effectDef = computed(() =>
	isEffect.value ? resolveEffect(props.sku.refId) : undefined,
);
const worldDef = computed(() =>
	isWorld.value ? resolveWorld(props.sku.refId) : undefined,
);
const categoryLabel = computed(() =>
	isEffect.value ? "Profile Effect" : isWorld.value ? "World" : "Item",
);
</script>

<style scoped>
.hero-stage {
  background: linear-gradient(135deg, #3f4d63, #232c3e);
}
</style>
