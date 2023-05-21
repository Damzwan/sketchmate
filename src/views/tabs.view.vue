<template>
  <ion-page>
    <ion-toast
      :is-open="isOpen"
      :message="text"
      :duration="duration"
      @didDismiss="dismiss()"
      :buttons="buttons"
      :color="color"
    ></ion-toast>
    <FullScreenLoader v-show="notificationRouteLoading" class="z-50" />
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom" v-if="show" mode="ios">
        <ion-tab-button :tab="FRONTEND_ROUTES.draw" :href="`/${FRONTEND_ROUTES.draw}`">
          <ion-icon :icon="pencil" />
          <ion-label>Draw</ion-label>
        </ion-tab-button>

        <ion-tab-button :tab="FRONTEND_ROUTES.gallery" :href="`/${FRONTEND_ROUTES.gallery}`">
          <ion-icon :icon="imagesOutline" />
          <ion-label>Gallery</ion-label>
        </ion-tab-button>

        <ion-tab-button :tab="FRONTEND_ROUTES.mate" :href="`/${FRONTEND_ROUTES.mate}`">
          <ion-icon :icon="peopleCircleOutline" />
          <ion-label>My Mate</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs, IonToast } from '@ionic/vue'
import { imagesOutline, pencil, peopleCircleOutline } from 'ionicons/icons'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { useRoute } from 'vue-router'
import { useToast } from '@/service/toast.service'
import FullScreenLoader from '@/components/loaders/CircularLoader.vue'

const { text, isOpen, dismiss, duration, color, buttons } = useToast()

const { user, unreadMessages, isLoading, notificationRouteLoading } = storeToRefs(useAppStore())
const route = useRoute()

const show = computed(() => user.value && user.value.mate && route.path != `/${FRONTEND_ROUTES.tutorial}`)
</script>

<style lang="scss">
ion-tab-button {
  --color: var(--ion-color-primary-contrast);
  --color-selected: var(--ion-color-secondary-shade);
}

ion-tab-bar {
  --background: var(--ion-color-primary);
}
</style>
