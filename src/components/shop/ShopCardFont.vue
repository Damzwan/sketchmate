<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-32 bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center px-3">
        <span
          class="text-3xl font-black text-[#3d1a14] text-center leading-tight"
          :style="{ fontFamily }"
        >
          {{ preview }}
        </span>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ShopSku } from '@/config/catalog.config'
import { FONTS, resolveFontFamily } from '@/config/profile_options.config'
import ShopCardShell from './ShopCardShell.vue'

const props = defineProps<{
  sku: ShopSku
  owned: boolean
  highlight?: boolean
}>()

defineEmits(['purchase'])

const fontFamily = computed(() => resolveFontFamily(props.sku.refId))
const preview = computed(
  () => FONTS.find((f) => f.value === props.sku.refId)?.preview || 'Aa'
)
</script>