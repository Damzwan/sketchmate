<template>
  <div
    class="relative rounded-[2.25rem] overflow-hidden transition-all duration-300 border-2 bg-white text-black flex flex-col justify-between"
    :class="[
      owned ? 'border-emerald-500 bg-[#FAFFF9]' : 'border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
      highlight && 'highlight-pulse',
    ]"
  >
    <slot name="preview" />

    <div class="px-3.5 py-3 border-t border-black/10 bg-white flex flex-col flex-1 justify-between">
      <div>
        <div class="flex items-baseline justify-between gap-1.5 mb-1">
          <h3 class="text-sm font-black text-black truncate leading-none tracking-tight">{{ sku.name }}</h3>
          <span v-if="owned" class="text-[9px] font-black text-emerald-600 uppercase tracking-widest shrink-0">
            ✓ Owned
          </span>
        </div>
        <p class="text-[10px] font-bold text-black/40 leading-tight mb-3 line-clamp-2 min-h-[24px]">
          {{ sku.desc }}
        </p>
      </div>

      <button
        v-if="!owned"
        class="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 border shadow-sm"
        :class="
          sku.kind === 'bundle'
            ? 'bg-secondary border-secondary text-white shadow-sm'
            : 'bg-white border-black text-black hover:bg-black/5'
        "
        @click.stop="$emit('purchase')"
      >
        {{ (sku as any).priceString || 'Unlock' }}
      </button>
      <div
        v-else
        class="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-emerald-100/60 border border-emerald-200 text-emerald-700 text-center select-none"
      >
        Collected
      </div>
    </div>

    <!-- Hand-drawn style Pack Tag -->
    <div
      v-if="sku.kind === 'bundle'"
      class="absolute top-2 left-2 px-2.5 py-0.5 bg-black border border-black text-white text-[8px] font-black uppercase tracking-widest rounded-full shadow-sm"
    >
      BOX
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ShopSku } from "@/config/catalog.config";
defineProps<{ sku: ShopSku; owned: boolean; highlight?: boolean }>();
defineEmits(["purchase"]);
</script>

<style scoped>
@keyframes highlight-pulse {
  0%, 100% { transform: scale(1); border-color: #000; }
  50% { transform: scale(1.02); border-color: var(--ion-color-secondary); }
}
.highlight-pulse {
  animation: highlight-pulse 1.2s ease-in-out 3;
}
</style>