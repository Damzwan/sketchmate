<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-28 relative overflow-hidden bg-white border-b border-black/5 shadow-inner">
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