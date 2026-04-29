<template>
  <ion-header class="ion-no-border bg-transparent absolute top-0 left-0 w-full z-50">
    <div class="flex items-center justify-between px-2 py-2">

     <div class="flex items-center space-x-4">
       <p class="cabin-sketch-regular text-2xl font-light text-black  ">
         {{title}}
       </p>

       <ion-button
         fill="outline"
         class="sketch-button-rounded h-9 m-0"
         @click="openProMenu"
       >
         <div class="flex items-center space-x-1 px-1">
           <ion-icon :icon="sparklesOutline" class="text-black text-[12px]" />
           <span class="cabin-sketch-regular text-black text-[17px] font-bold lowercase">plus+</span>
         </div>
       </ion-button>
     </div>

      <div class="flex items-center space-x-4 pr-2">

        <button class="relative flex items-center p-1 active:scale-90 transition-transform group">
          <ion-icon :icon="peopleOutline" class="text-[30px] text-black" />
          <span class="cabin-sketch-regular text-[13px] font-bold text-black leading-none">
              142
            </span>
          <div class="w-1.5 h-1.5 bg-green-500 rounded-full ml-1 animate-pulse"></div>
        </button>

        <button
          @click="() => openMenu(Menu.FeedbackMenu)"
          class="active:scale-90 transition-transform flex items-center"
        >
          <ion-icon :icon="svg(mdiMessageAlertOutline)" class="text-[26px] text-black" />
        </button>

        <button
          @click="openNotifications"
          class="active:scale-90 transition-transform flex items-center"
        >
          <ion-icon :icon="notificationsOutline" class="text-[26px] text-black" />
        </button>

      </div>
    </div>
  </ion-header>
</template>

<script setup lang="ts">
import { IonHeader, IonIcon, IonButton } from '@ionic/vue'
import { sparklesOutline, notificationsOutline, peopleOutline } from 'ionicons/icons'
import { mdiMessageAlertOutline } from '@mdi/js'
import { Menu } from '@/draw/types/draw.types'
import { svg } from '@/helper/general.helper'
import { useMenuStore } from '@/store/menu.store'

defineProps<{ title: string }>()

const { openMenu } = useMenuStore()
const openProMenu = () => { /* logic */
}
const openNotifications = () => { /* logic */
}

</script>

<style scoped>

/* Rounded Sketchy Border for ion-button */
.sketch-button-rounded {
  --border-width: 2px;
  --border-color: rgba(0, 0, 0, 0.2);
  /* This creates a wobbly oval instead of a rectangle */
  --border-radius: 50px 20px 50px 20px / 20px 50px 20px 50px;
  --padding-start: 10px;
  --padding-end: 10px;
}


/* Custom shadow/glow for the badge */
.shadow-sm {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>