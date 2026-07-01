<template>
  <div
    class="relative rounded-[2rem] overflow-hidden flex flex-col bg-tertiary border shadow-sm transition-all duration-300"
    :class="[
      owned ? 'border-emerald-400/60' : 'border-primary/40',
      highlight && 'highlight-pulse'
    ]"
  >
    <slot name="preview" />

    <div class="px-3.5 py-3 flex flex-col flex-1 justify-between">
      <div>
        <div class="flex items-baseline justify-between gap-1.5 mb-0.5">
          <h3 class="text-[15px] font-black text-black truncate leading-none tracking-tight">
            {{ sku.name }}
          </h3>
          <span v-if="owned" class="text-[11px] font-black text-emerald-600 tracking-tight shrink-0">
            Owned
          </span>
        </div>
        <p class="text-[12px] text-black leading-tight mb-2 line-clamp-2 min-h-[28px]">
          {{ sku.desc }}
        </p>
      </div>

      <ion-button
        v-if="!owned"
        expand="block"
        color="secondary"
        shape="round"
        size="small"
        class="m-0 tracking-tight"
        @click.stop="$emit('purchase')"
      >
        {{ (sku as any).priceString || 'Unlock' }}
      </ion-button>
      <div
        v-else
        class="w-full py-1.5 rounded-full text-[12px] font-black tracking-tight bg-emerald-50 text-emerald-700 text-center select-none flex items-center justify-center gap-1"
      >
        <ion-icon :icon="mdiCheck" class="text-sm" />
        Owned
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue'
import { mdiCheck } from '@mdi/js'
import type { ShopSku } from '@/config/catalog.config'

defineProps<{ sku: ShopSku; owned: boolean; highlight?: boolean }>()
defineEmits(['purchase'])
</script>

<style scoped>
@keyframes highlight-pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  50% {
    transform: scale(1.03);
    box-shadow: 0 0 0 3px var(--ion-color-secondary);
  }
}

.highlight-pulse {
  animation: highlight-pulse 1.2s ease-in-out 3;
}
</style>
