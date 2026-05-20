<template>
  <button
    class="w-full bg-white/60 backdrop-blur-xl border-2 border-white rounded-[2rem] p-4 flex items-center gap-4 shadow-sm active:scale-[0.98] transition-all"
    @click="$emit('click')"
  >
    <div class="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center shrink-0">
      <ion-icon :icon="svg(icon)" class="text-2xl text-secondary" />
    </div>

    <div class="flex-1 min-w-0 text-left">
      <p class="text-[10px] font-black uppercase tracking-widest text-black/40 leading-none">
        {{ label }}
      </p>
      <p class="text-base font-black text-black mt-1 truncate">{{ value }}</p>
    </div>

    <!-- Slot for any inline preview swatch / mini-card -->
    <div class="shrink-0">
      <slot name="preview" />
    </div>

    <ion-icon :icon="svg(mdiChevronRight)" class="text-2xl text-black/30 shrink-0" />
  </button>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { mdiChevronRight } from '@mdi/js'
import { svg } from '@/helper/general.helper'

defineProps<{
  icon: string
  label: string
  value: string
}>()

defineEmits(['click'])
</script>