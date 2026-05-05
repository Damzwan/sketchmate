<template>
  <ion-header class="ion-no-border bg-background relative w-full z-50 top-pad-safe shadow-none">
    <div class="flex items-center px-2 h-[50px]">
      <ion-back-button
        default-href="/home"
        :icon="chevronBackOutline"
        text=""
        class="text-black"
      />

      <p class="cabin-sketch-regular text-2xl font-light text-black ml-2 mt-1">
        {{ title }}
      </p>
    </div>
  </ion-header>
</template>

<script setup lang="ts">
import { IonHeader, IonBackButton } from '@ionic/vue'
import { chevronBackOutline } from 'ionicons/icons'

defineProps<{ title: string }>()
</script>

<style scoped>
ion-back-button {
  --color: black;
}
</style>