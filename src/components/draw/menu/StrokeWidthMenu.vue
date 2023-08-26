<template>
  <ion-popover :trigger="trigger" :showBackdrop="false">
    <ion-content>
      <div class="px-2 pt-1">
        <label for="slider">Stroke Width</label>
        <ion-range
          id="slider"
          :value="strokeWidth"
          @ionChange="(e: any) => emits('update:strokeWidth', e.detail.value)"
          min="1"
          max="20"
          color="secondary"
        />
      </div>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonPopover, IonRange, IonContent } from '@ionic/vue'

defineProps<{
  trigger: string
  strokeWidth: number
}>()

const emits = defineEmits(['update:strokeWidth'])
</script>

<style scoped></style>
