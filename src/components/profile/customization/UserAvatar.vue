<template>
  <div class="relative inline-block" :style="containerStyle">
    <!-- Avatar image holder -->
    <div
      class="w-full h-full rounded-[2.5rem] border-4 shadow-sm flex items-center justify-center bg-white overflow-hidden transition-all duration-500"
      :style="{ borderColor: borderColor }"
    >
      <img
        :src="img || user?.img"
        alt=""
        class="w-full h-full object-cover bg-zinc-100"
      />
    </div>

    <!-- Decoration overlay (frame / halo / orbiting particles / badge) -->
    <AvatarDecoration
      :decoration-id="customization?.decorationId"
      :def="decorationDef"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AvatarDecoration from './AvatarDecoration.vue'
import {
  resolveTheme,
  type Decoration,
  type Customization
} from '@/config/profile_options.config'

const props = defineProps<{
  user?: any
  customization?: Partial<Customization>
  /** Direct decoration override (for previews) */
  decorationDef?: Decoration
  size?: 'sm' | 'md' | 'lg' | 'xl'
  img?: string
}>()

const containerStyle = computed(() => {
  const sizes = { sm: '40px', md: '60px', lg: '80px', xl: '128px' }
  const dim = sizes[props.size || 'md']
  return { width: dim, height: dim }
})

// Border color pulls from the active theme accent so the avatar feels integrated
const borderColor = computed(() => {
  if (!props.customization?.themeId) return 'rgba(0,0,0,0.1)'
  return resolveTheme(props.customization.themeId).accentColor
})
</script>