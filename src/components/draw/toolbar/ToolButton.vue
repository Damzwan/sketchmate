<template>
  <button @click="$emit('click', $event)" :disabled="disabled"
    class="relative cursor-pointer flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
    :class="[
      active ? 'bg-primary/80 shadow-sm' : '',
      customClass ? customClass : ' hover:bg-primary/20 cursor-pointer'
    ]">
    <ion-icon :icon="icon" class="w-6 h-6 pointer-events-none" :class="iconClass || 'text-black'" />
    <slot></slot>

    <div v-if="badge && badge > 0"
      class="absolute -bottom-1 -right-1 bg-secondary text-white text-[11px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md border-2 border-primary/40 pointer-events-none">
      {{ badge }}
    </div>
  </button>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'

defineProps<{
  icon: string,
  active?: boolean,
  disabled?: boolean,
  customClass?: string,
  iconClass?: string,
  badge?: number
}>()
defineEmits(['click'])
</script>