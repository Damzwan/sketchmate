<template>
  <div class="flex flex-col items-center">
    <!-- Title Badge -->
    <transition name="fade">
      <span
        v-if="showTitle && customization?.title"
        class="text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full mb-1 transition-all"
        :style="titleStyle"
      >
        {{ customization.title }}
      </span>
    </transition>

    <!-- Name -->
    <h2
      class="font-black drop-shadow-sm transition-colors duration-500"
      :class="nameSizeClass"
      :style="{ color: customization?.nameColor || '#18181b' }"
    >
      {{ user?.name }}
    </h2>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  user: any;
  customization: any;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTitle?: boolean;
}>()

const nameSizeClass = computed(() => {
  return {
    'text-sm': props.size === 'sm',
    'text-lg': props.size === 'md',
    'text-xl': props.size === 'lg',
    'text-3xl': props.size === 'xl'
  }
})

const titleStyle = computed(() => ({
  background: props.customization?.borderColor === 'rgba(0,0,0,0.12)'
    ? 'rgba(0,0,0,0.05)'
    : (props.customization?.borderColor + '33'),
  color: props.customization?.nameColor || '#18181b'
}))
</script>