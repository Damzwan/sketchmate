<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-32 bg-gradient-to-br from-indigo-50 to-purple-100 flex flex-col items-center justify-center px-3">
        <div class="text-4xl mb-2">{{ title?.emoji || '🏷️' }}</div>
        <div class="px-3 py-1 bg-white/80 backdrop-blur-sm rounded-full text-[10px] font-black uppercase tracking-widest text-[#3d1a14]">
          {{ title?.name || sku.name }}
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ShopSku } from '@/config/catalog.config'
import { TITLES } from '@/config/profile_options.config'
import ShopCardShell from './ShopCardShell.vue'

const props = defineProps<{
  sku: ShopSku
  owned: boolean
  highlight?: boolean
}>()

defineEmits(['purchase'])

const title = computed(() => TITLES.find((t) => t.id === props.sku.refId))
</script>