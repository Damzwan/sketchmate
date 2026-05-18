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
                    @click="navigateToHomeScreen"
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
import { useAuthStore } from '@/store/auth.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { slideTransition } from '@/helper/animation.helper'
import { requestNotifications } from '@/helper/notification.helper'
import { useToast } from '@/service/toast.service'
import notificationsImage from '@/assets/illustrations/notifications.webp'
import { onMounted } from 'vue'

const ionRouter = useIonRouter()

onMounted(async () => {
  try {
    await import('@/views/home.view.vue')
  } catch (error) {
  }
})


async function enableNotifications() {
  const allowed = await requestNotifications()
  if (!allowed) {
    const { toast } = useToast()
    toast('Notifications are not enabled', { color: 'warning' })
  }
  navigateToHomeScreen()
}


function navigateToHomeScreen() {
  const { user } = useAuthStore()
  if (!user) return
  ionRouter.replace(FRONTEND_ROUTES.home, slideTransition)
}

</script>

<style scoped>

</style>