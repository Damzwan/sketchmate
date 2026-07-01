<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-28 flex items-center justify-center px-3 border-b border-primary/30 bg-[#FFF9F2] select-none overflow-hidden">
        <span
          class="text-4xl font-black tracking-tight leading-none"
          :class="effectClass"
        >
          Aa
        </span>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { resolveFontEffectClass } from "@/config/profile_options.config";
import ShopCardShell from "./ShopCardShell.vue";

const props = defineProps<{
	sku: ShopSku;
	owned: boolean;
	highlight?: boolean;
}>();
defineEmits(["purchase"]);
const effectClass = computed(() => resolveFontEffectClass(props.sku.refId));
</script>
