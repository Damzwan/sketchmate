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
    />
    <PhotoSwiper v-if="user && inbox.length > 0" />
    <FullScreenLoader v-show="notificationRouteLoading" class="z-50" />

    <ion-tabs>
      <ion-router-outlet :animation="routerAnimation" />
      <ion-tab-bar slot="bottom" v-if="show" mode="ios">
        <ion-tab-button :tab="FRONTEND_ROUTES.draw" :href="`/${FRONTEND_ROUTES.draw}`"
                        @click="r.push(FRONTEND_ROUTES.draw, routerAnimation)">
          <ion-icon :icon="pencil" />
          <ion-label>Draw</ion-label>
        </ion-tab-button>

        <ion-tab-button
          :disabled="!isLoggedIn"
          :tab="FRONTEND_ROUTES.gallery"
          :href="`/${FRONTEND_ROUTES.gallery}`"
          @click="r.push(FRONTEND_ROUTES.gallery, routerAnimation)"
        >
          <ion-icon :icon="imagesOutline" />
          <ion-label>Gallery</ion-label>
        </ion-tab-button>

        <ion-tab-button
          :disabled="!isLoggedIn"
          :tab="FRONTEND_ROUTES.connect"
          :href="`/${FRONTEND_ROUTES.connect}`"
          @click="r.push(FRONTEND_ROUTES.connect, routerAnimation)"
          class="relative"
        >
          <ion-icon :icon="peopleCircleOutline" />
          <ion-label>Connect</ion-label>
          <ion-badge class="ml-2" color="secondary" v-if="notificationBadgeCount > 0">
            {{ notificationBadgeCount }}
          </ion-badge>
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
  useIonRouter,
  IonBadge
} from '@ionic/vue'
import { imagesOutline, pencil, peopleCircleOutline } from 'ionicons/icons'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/service/toast.service'
import FullScreenLoader from '@/components/general/loaders/CircularLoader.vue'
import { routerAnimation } from '@/helper/animation.helper'
import { useRoute } from 'vue-router'
import { useSwipe } from '@vueuse/core'
import PhotoSwiper from '@/components/photoswiper/PhotoSwiper.vue'
import { useInboxStore } from '@/store/inbox.store'
import { useNotificationStore } from '@/store/notification.store'

const { text, isOpen, dismiss, duration, color, buttons, position } = useToast()
const r = useIonRouter()


const toast = ref()
useSwipe(toast, {
  onSwipeEnd() {
    dismiss()
  }
})

const { user, isLoggedIn } = storeToRefs(useAuthStore())
const { inbox } = storeToRefs(useInboxStore())
const { notificationRouteLoading } = storeToRefs(useNotificationStore())

const notificationBadgeCount = computed(() => {
  return user.value
    ? (user.value.mate_requests_received?.length ?? 0) + (user.value.balloon?.received ? 1 : 0)
    : 0
})


const route = useRoute()
const show = computed(() => route.path != `/${FRONTEND_ROUTES.login}` && !route.fullPath.includes('capacitor')) // capacitor due to redirect login url


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
