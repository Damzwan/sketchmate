<template>
  <div class="relative inline-block" :style="containerStyle">
    <!-- Outer Border (Avatar Ring) -->
    <div
      class="w-full h-full rounded-[2.5rem] border-4 shadow-sm flex items-center justify-center transition-all duration-500 bg-white"
      :style="{ borderColor: customization?.avatarBorderColor || 'rgba(0,0,0,0.1)' }"
    >
      <!-- Avatar Image -->
      <img
        :src="img || user?.img"
        class="w-[90%] h-[90%] rounded-[2.2rem] object-cover bg-zinc-100"
      />
    </div>

    <!-- Vibe Emoji (Floating) -->
    <transition name="pop">
      <div
        v-if="showVibe && customization?.vibeEmoji"
        class="absolute -top-1 -right-1 text-2xl drop-shadow-md animate-bounce-slow"
      >
        {{ customization.vibeEmoji }}
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  user?: any;
  customization?: any;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showVibe?: boolean;
  img?: string;
}>();

const containerStyle = computed(() => {
  const sizes = {
    sm: '40px',
    md: '60px',
    lg: '80px',
    xl: '128px'
  };
  const dim = sizes[props.size || 'md'];
  return { width: dim, height: dim };
});
</script>