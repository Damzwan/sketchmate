<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <!-- Mid slate + faux name line so subtle effects (shattered glass, shimmer)
           are actually visible instead of washing out on white. -->
      <div class="h-28 relative overflow-hidden border-b border-primary/30 effect-stage flex items-center justify-center">
        <span class="text-white/85 font-black text-lg tracking-tight cabin-sketch-regular select-none">Aa</span>
        <ProfileEffect v-if="effectDef" :def="effectDef" :preview="true" />
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { resolveEffect } from "@/config/profile_options.config";
import ShopCardShell from "./ShopCardShell.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";

const props = defineProps<{
	sku: ShopSku;
	owned: boolean;
	highlight?: boolean;
}>();
defineEmits(["purchase"]);
const effectDef = computed(() => resolveEffect(props.sku.refId));
</script>

<style scoped>
.effect-stage {
  background: linear-gradient(135deg, #4a5568, #2d3748);
}
</style>