<template>
  <button
    class="w-full cursor-pointer bg-tertiary border border-primary/40 rounded-[1.5rem] p-3 flex flex-col text-left shadow-sm active:scale-[0.96] hover:scale-[1.02] transition-all"
    @click="$emit('click')"
  >
    <div class="flex items-center gap-2 mb-2 w-full">
      <div class="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
        <ion-icon :icon="svg(icon)" class="text-lg text-secondary" />
      </div>
      <p class="text-sm uppercase font-bold tracking-widest text-black leading-none truncate flex-1">
        {{ label }}
      </p>
    </div>

    <div class="flex items-end justify-between w-full mt-auto">
      <p class="text-sm font-black text-black truncate pr-2">{{ value }}</p>

      <div class="shrink-0 h-6 flex items-center justify-center">
        <slot name="preview" />
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { svg } from '@/helper/general.helper'

defineProps<{
  icon: string;
  label: string;
  value: string;
}>()

defineEmits(['click'])
</script>