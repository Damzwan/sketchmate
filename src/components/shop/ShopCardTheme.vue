<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div
        class="h-32 relative overflow-hidden"
        :style="{ background: theme.cardBg }"
      >
        <!-- Mini profile card preview -->
        <div class="absolute inset-3 flex items-center gap-2">
          <div
            class="w-10 h-10 rounded-full border-2 shrink-0"
            :style="{ borderColor: theme.accentColor, backgroundColor: theme.titleBg }"
          ></div>
          <div class="flex-1 min-w-0">
            <div
              class="text-sm font-black truncate leading-tight"
              :style="{ color: theme.nameColor }"
            >
              {{ user?.name || 'Sketcher' }}
            </div>
            <div
              class="text-[10px] font-bold italic truncate leading-tight"
              :style="{ color: theme.descColor }"
            >
              {{ theme.desc }}
            </div>
          </div>
        </div>

        <!-- Swatches -->
        <div class="absolute bottom-2 left-3 flex gap-1">
          <div
            v-for="(c, i) in theme.swatches"
            :key="i"
            class="w-3 h-3 rounded-full border border-white/70 shadow-sm"
            :style="{ backgroundColor: c }"
          ></div>
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ShopSku } from '@/config/catalog.config'
import { resolveTheme } from '@/config/profile_options.config'
import ShopCardShell from './ShopCardShell.vue'

const props = defineProps<{
  sku: ShopSku
  user?: any
  owned: boolean
  highlight?: boolean
}>()

defineEmits(['purchase'])

const theme = computed(() => resolveTheme(props.sku.refId))
</script>