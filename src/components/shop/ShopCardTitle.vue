<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-28 bg-[#F4EFE6] flex flex-col items-center justify-center px-3 border-b border-black/5 select-none">
        <div class="text-3xl mb-1.5 rotate-6 animate-pulse">{{ title?.emoji || '🏷️' }}</div>
        <div class="px-2.5 py-1 bg-white border border-black/40 rounded-lg text-[10px] font-black uppercase tracking-widest text-black shadow-sm">
          {{ title?.name || sku.name }}
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { TITLES } from "@/config/profile_options.config";
import ShopCardShell from "./ShopCardShell.vue";

const props = defineProps<{
	sku: ShopSku;
	owned: boolean;
	highlight?: boolean;
}>();
defineEmits(["purchase"]);
const title = computed(() => TITLES.find((t) => t.id === props.sku.refId));
</script>