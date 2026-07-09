<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" previewable @purchase="$emit('purchase')" @preview="$emit('preview')">
    <template #preview>
      <div class="h-28 bg-[#FFF9F2] flex items-center justify-center px-3 border-b border-black/5 select-none">
        <span
          class="text-3xl font-black text-black text-center tracking-tight leading-none drop-shadow-sm"
          :style="{ fontFamily }"
        >
          {{ preview }}
        </span>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { FONTS, resolveFontFamily } from "@/config/profile_options.config";
import ShopCardShell from "./ShopCardShell.vue";

const props = defineProps<{
	sku: ShopSku;
	owned: boolean;
	highlight?: boolean;
}>();
defineEmits(["purchase", "preview"]);

const fontFamily = computed(() => resolveFontFamily(props.sku.refId));
const preview = computed(
	() => FONTS.find((f) => f.value === props.sku.refId)?.preview || "Aa",
);
</script>