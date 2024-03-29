<template>
  <ion-page>
    <ion-toast
      ref="toast"
      :is-open="isOpen"
      :message="text"
      :duration="duration"
      @didDismiss="dismiss()"
      :buttons="buttons"
      :color="color"
      :position="position"
    ></ion-toast>
    <FullScreenLoader v-show="notificationRouteLoading" class="z-50" />
      <ion-tabs>
        <ion-router-outlet :animation="routerAnimation" />
         <ion-tab-bar slot="bottom" v-if="show" mode="ios" class="relative">
           <ion-tab-button :tab="FRONTEND_ROUTES.draw" :href="`/${FRONTEND_ROUTES.draw}`" @click="onDrawClick">
             <ion-icon :icon="pencil" />
             <ion-label>Draw</ion-label>
           </ion-tab-button>

           <ion-tab-button
             :tab="FRONTEND_ROUTES.gallery"
             :href="`/${FRONTEND_ROUTES.gallery}`"
             @click="r.push(FRONTEND_ROUTES.gallery, routerAnimation)"
           >
             <ion-icon :icon="imagesOutline" />
             <ion-label>Gallery</ion-label>
           </ion-tab-button>

           <ion-tab-button
             :tab="FRONTEND_ROUTES.connect"
             :href="`/${FRONTEND_ROUTES.connect}`"
             @click="r.push(FRONTEND_ROUTES.connect, routerAnimation)"
           >
             <ion-icon :icon="peopleCircleOutline" />
             <ion-label>Connect</ion-label>
           </ion-tab-button>
         </ion-tab-bar>
      </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonIcon,
  IonLabel,
  IonPage,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonToast,
  useIonRouter
} from '@ionic/vue'
import { imagesOutline, pencil, peopleCircleOutline } from 'ionicons/icons'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { useToast } from '@/service/toast.service'
import FullScreenLoader from '@/components/loaders/CircularLoader.vue'
import { routerAnimation } from '@/helper/animation.helper'
import { useRoute } from 'vue-router'
import { useSwipe } from '@vueuse/core'

const { text, isOpen, dismiss, duration, color, buttons, position } = useToast()
const r = useIonRouter()

const toast = ref()
useSwipe(toast, {
  onSwipeEnd() {
    dismiss()
  }
})

const { notificationRouteLoading } = storeToRefs(useAppStore())

const route = useRoute()
const show = computed(() => route.path != `/${FRONTEND_ROUTES.login}` && !route.fullPath.includes('capacitor')) // capacitor due to redirect login url

async function onDrawClick() {
  if (route.path == `/${FRONTEND_ROUTES.draw}`) {
    const { useDrawStore } = await import('@/store/draw/draw.store')
    useDrawStore().getCanvas().discardActiveObject()
  } else r.push(FRONTEND_ROUTES.draw, routerAnimation)
}
</script>

<style lang="scss" scoped>
ion-tab-button {
  --color: var(--ion-color-primary-contrast);
  --color-selected: var(--ion-color-secondary-shade);
}

ion-tab-bar {
  --background: var(--ion-color-primary);
}

ion-icon {
  width: 55%;
  height: 55%;
}
</style>
