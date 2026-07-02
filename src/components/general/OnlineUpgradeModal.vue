<template>
  <ion-modal
    :is-open="isOnlineUpgradeMenuOpen"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-title-modal"
  >
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">

      <!-- Header -->
      <div class="shrink-0 pt-2 mb-6 text-center relative">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Update Required
        </h1>
        <p class="text-xs font-bold opacity-80 uppercase tracking-widest mt-2">
          New version available
        </p>
      </div>

      <!-- Content -->
      <div class="flex-1 flex flex-col items-center justify-center px-4 space-y-6 text-center">
        <div class="relative">
          <div class="w-24 h-24 bg-secondary/10 rounded-[2rem] flex items-center justify-center rotate-[-5deg]">
            <ion-icon :icon="svg(mdiPalette)" class="text-5xl text-secondary" />
          </div>
          <div class="absolute -top-2 -right-2 w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center shadow-lg animate-bounce">
            <ion-icon :icon="svg(mdiCreation)" class="text-lg text-white" />
          </div>
        </div>

        <div class="space-y-2">
          <h2 class="text-2xl font-black text-black tracking-tight">Time to upgrade!</h2>
          <p class="text-[15px] text-black/60 leading-relaxed max-w-[280px]">
            You must update to the latest version of Sketchmate to join collaborative sessions and draw with others online.
          </p>
        </div>
      </div>

      <!-- Action Area -->
      <div class="pt-4 pb-2 shrink-0">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          @click="onBtnClick"
        >
          Update Now
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          @click="handleDismiss"
        >
          Maybe later
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonModal, IonButton, IonIcon } from '@ionic/vue'
import { App } from '@capacitor/app'
import { AppUpdate } from '@capawesome/capacitor-app-update'
import { mdiCreation, mdiPalette } from '@mdi/js'
import { useMenuStore } from '@/store/menu.store'
import { storeToRefs } from 'pinia'
import { svg } from '@/helper/general.helper'

const menuStore = useMenuStore()
const { isOnlineUpgradeMenuOpen } = storeToRefs(menuStore)

async function onBtnClick() {
  try {
    const info = await AppUpdate.getAppUpdateInfo();
    if (info.immediateUpdateAllowed) {
      await AppUpdate.performImmediateUpdate();
    } else {
      await AppUpdate.openAppStore();
      await App.exitApp();
    }
  } catch (error) {
    console.error("Failed to trigger update flow:", error);
  }
}

const handleDismiss = () => {
  isOnlineUpgradeMenuOpen.value = false
}
</script>

<style scoped>
ion-modal.liquid-title-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 85vh;
  --background: var(--ion-color-tertiary);
}

ion-modal.liquid-title-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>