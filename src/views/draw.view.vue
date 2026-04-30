<template>
  <ion-page class="slide-page">
    <ion-nav ref="navRef" :root="DrawMain" :animation="slideTransition" />
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IonNav, IonPage, onIonViewWillLeave, useBackButton } from '@ionic/vue'
import DrawMain from '@/components/draw/DrawMain.vue'
import { slideTransition } from '@/helper/animation.helper'
import { performRoomExit } from '@/draw/helpers/drawSyncing.helper'
import { useDrawStore } from '@/draw/store/draw.store'

const navRef = ref<InstanceType<typeof IonNav> | null>(null)

useBackButton(10, async (processNextHandler) => {
  const nav = navRef.value?.$el
  if (nav) {
    const canGoBack = await nav.canGoBack()

    if (canGoBack) {
      await nav.pop()
    } else {
      processNextHandler()
    }
  } else {
    processNextHandler()
  }
})

onIonViewWillLeave(() => {
  performRoomExit()

  const { resetCanvasID } = useDrawStore()
  resetCanvasID()
})
</script>