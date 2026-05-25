<template>
  <div
    class="snap-start shrink-0 w-[260px] relative rounded-[2rem] overflow-hidden border-2 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white shadow-lg"
    :class="highlight && 'highlight-pulse'"
  >
    <div class="absolute inset-0 grain-bg opacity-30 mix-blend-overlay"></div>
    <div class="absolute -right-12 -top-12 w-40 h-40 bg-white/20 blur-3xl rounded-full"></div>

    <div class="relative p-4">
      <div class="flex items-center justify-between mb-3">
        <span class="px-2 py-1 bg-white/25 backdrop-blur-sm text-[9px] font-black uppercase tracking-widest rounded-full">
          Pack · {{ sku.grants.length }} items
        </span>
        <span v-if="owned" class="text-[9px] font-black uppercase tracking-widest bg-emerald-400/90 text-white px-2 py-1 rounded-full">
          ✓ Owned
        </span>
      </div>

      <h3 class="text-xl font-black leading-none mb-1 drop-shadow-md">{{ sku.name }}</h3>
      <p class="text-xs font-medium text-white/85 leading-snug mb-3">{{ sku.desc }}</p>

      <!-- Grant preview chips -->
      <div class="flex flex-wrap gap-1 mb-3 min-h-[28px]">
        <span
          v-for="g in sku.grants.slice(0, 4)"
          :key="g"
          class="px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-[9px] font-bold"
        >
          {{ formatGrant(g) }}
        </span>
        <span
          v-if="sku.grants.length > 4"
          class="px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-[9px] font-bold"
        >
          +{{ sku.grants.length - 4 }}
        </span>
      </div>

      <button
        v-if="!owned"
        class="w-full py-2.5 rounded-xl bg-white text-purple-600 text-xs font-black uppercase tracking-wider shadow-md active:scale-95 transition-transform"
        @click="$emit('purchase')"
      >
        {{ (sku as any).priceString || 'Unlock Pack' }}
      </button>
      <div
        v-else
        class="w-full py-2.5 rounded-xl bg-white/20 text-white text-xs font-black uppercase tracking-wider text-center"
      >
        In Your Collection
      </div>
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

const formatGrant = (g: string): string => {
  const [, name] = g.split('.')
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
</script>

<style scoped>
.grain-bg {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}

@keyframes highlight-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(185, 70, 58, 0); }
  50% { box-shadow: 0 0 0 10px rgba(185, 70, 58, 0.35); }
}
.highlight-pulse {
  animation: highlight-pulse 1.2s ease-in-out 3;
  outline: 2px solid #B9463A;
}
</style>