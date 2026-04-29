<template>
  <ion-content class="bg-primary my-safe-area">
    <div class="w-full h-full flex flex-col justify-between items-center">
      <div class="p-4">
        <p class="cabin-sketch-regular text-4xl text-center">Enable Notifications</p>
        <p class="cabin-sketch-regular text-3xl text-center pt-4">Stay up to date with the latest drawings from your
          friends</p>
      </div>


      <img :src="notificationsImage" class="md:w-[50%] max-w-[600px] w-[90%] mx-auto" alt="friends connect" />
      <div class="flex flex-col gap-4 justify-center items-center">
        <ion-button shape="round" color="secondary" fill="clear" size="large"
                    @click="navigateToConnectionScreen"
        >

          Skip for now
        </ion-button>

        <ion-button shape="round" color="secondary" size="large" class="pb-12"
                    @click="enableNotifications"
        >

          Enable Notifications
        </ion-button>

      </div>

    </div>

  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonContent, useIonRouter } from '@ionic/vue'
import { isNative } from '@/helper/general.helper'
import { useAuthStore } from '@/store/auth.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { masterAnimation, routerAnimation } from '@/helper/animation.helper'
import { ref } from 'vue'
import { requestNotifications } from '@/helper/notification.helper'
import { useToast } from '@/service/toast.service'
import notificationsImage from '@/assets/illustrations/notifications.webp'

const ionRouter = useIonRouter()

// const navLink = ref<any>()


async function enableNotifications() {
  const allowed = await requestNotifications()
  if (!allowed) {
    const { toast } = useToast()
    toast('Notifications are not enabled', { color: 'warning' })
  }
  // if (isNative()) {
  //   navLink.value?.$el?.click()
  // } else
  navigateToConnectionScreen()
}


function navigateToConnectionScreen() {
  const { user } = useAuthStore()
  if (!user) return
  ionRouter.replace(FRONTEND_ROUTES.home, masterAnimation)
}

</script>

<style scoped>

</style>