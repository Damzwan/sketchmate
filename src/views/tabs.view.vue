<template>
  <ion-page>
    <ion-toast
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
      <ion-tab-bar slot="bottom" v-if="show" mode="ios">
        <ion-tab-button
          :tab="FRONTEND_ROUTES.draw"
          :href="`/${FRONTEND_ROUTES.draw}`"
          @click="r.push(FRONTEND_ROUTES.draw, routerAnimation)"
        >
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
          :tab="FRONTEND_ROUTES.mate"
          :href="`/${FRONTEND_ROUTES.mate}`"
          @click="r.push(FRONTEND_ROUTES.mate, routerAnimation)"
        >
          <ion-icon :icon="peopleCircleOutline" />
          <ion-label>My Mate</ion-label>
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
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { useToast } from '@/service/toast.service'
import FullScreenLoader from '@/components/loaders/CircularLoader.vue'
import { routerAnimation } from '@/helper/animation.helper'
import { useRoute } from 'vue-router'

const { text, isOpen, dismiss, duration, color, buttons, position } = useToast()
const r = useIonRouter()

const { notificationRouteLoading } = storeToRefs(useAppStore())

const route = useRoute()
const show = computed(() => route.path != `/${FRONTEND_ROUTES.connect}` && !route.query.trial)
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
