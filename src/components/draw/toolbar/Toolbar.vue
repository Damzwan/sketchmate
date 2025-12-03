<template>
  <div class="w-full h-12 top-0 flex justify-center">
    <div class="w-full bg-primary h-full z-50 rounded-b-lg flex justify-center items-center">
      <div class="h-full w-full flex items-center">
        <ToolbarItems :toolbarItems="config.left" v-if="config.left" />
      </div>

      <div class="w-1 h-3/4 bg-primary-shade mx-1 rounded" v-if="config.showDivider" />


      <div class="h-full w-full justify-end items-center flex">
        <ToolbarItems :toolbarItems="config.right" v-if="config.right" />

      </div>
    </div>
  </div>
</template>


<script setup lang="ts">

import { ToolbarSection } from '@/config/draw/toolbar.config'
import { DrawTool } from '@/types/draw.types'
import ToolbarItems from '@/components/draw/toolbar/ToolbarItems.vue'

defineProps<{
  config: ToolbarSection,
  selectedTool: DrawTool
}>()


</script>

<style scoped>
</style>