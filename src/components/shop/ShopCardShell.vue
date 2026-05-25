<template>
  <div
    class="relative rounded-[2rem] overflow-hidden transition-all"
    :class="[
      'bg-white border-2',
      owned ? 'border-emerald-300' : 'border-white shadow-sm',
      highlight && 'highlight-pulse',
    ]"
  >
    <slot name="preview" />

    <div class="px-3 py-2.5 border-t border-black/5">
      <div class="flex items-baseline justify-between gap-2 mb-1">
        <h3 class="text-sm font-black text-[#3d1a14] truncate leading-none">{{ sku.name }}</h3>
        <span v-if="owned" class="text-[9px] font-black text-emerald-600 uppercase tracking-widest shrink-0">
          ✓ Owned
        </span>
      </div>
      <p class="text-[10px] font-medium text-[#3d1a14]/50 italic leading-tight mb-2 truncate">
        {{ sku.desc }}
      </p>

      <button
        v-if="!owned"
        class="w-full py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-transform active:scale-95"
        :class="
          sku.kind === 'bundle'
            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
            : 'bg-[#B9463A] text-white shadow-sm'
        "
        @click.stop="$emit('purchase')"
      >
        {{ (sku as any).priceString || 'Unlock' }}
      </button>
      <div
        v-else
        class="w-full py-2 rounded-xl text-[11px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 text-center"
      >
        In Collection
      </div>
    </div>

    <!-- Bundle badge -->
    <div
      v-if="sku.kind === 'bundle'"
      class="absolute top-2 left-2 px-2 py-1 bg-purple-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-md"
    >
      Pack
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ShopSku } from '@/config/catalog.config'

defineProps<{
  sku: ShopSku
  owned: boolean
  highlight?: boolean
}>()

defineEmits(['purchase'])
</script>

<style scoped>
@keyframes highlight-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(185, 70, 58, 0); }
  50% { box-shadow: 0 0 0 8px rgba(185, 70, 58, 0.25); }
}
.highlight-pulse {
  animation: highlight-pulse 1.2s ease-in-out 3;
  border-color: #B9463A !important;
}
</style>