<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet :animation="masterAnimation" />

      <ion-tab-bar
        slot="bottom"
        mode="ios"
        class="h-12 border-t border-black/5 pb-[var(--ion-safe-area-bottom,0)] shadow-lg"
      >
        <ion-tab-button
          v-for="tab in tabs"
          :key="tab.route"
          :tab="tab.route"
          :href="`/${tab.route}`"
          @click.stop.prevent="handleTabClick(tab.route)"
          class="bg-transparent"
          :class="{ 'tab-selected': isTabActive(tab.route) }"
        >
          <template v-if="tab.route === FRONTEND_ROUTES.profile">
            <div
              class="w-7 h-7 rounded-full border-2 transition-all duration-200 overflow-hidden flex justify-center items-center"
              :class="isTabActive(tab.route) ? 'border-[var(--ion-color-secondary)] scale-110' : 'border-black/20'"
            >
              <img v-if="profileImg" :src="profileImg" class="w-full h-full object-cover" />
              <ion-icon v-else :icon="personOutline" class="text-[20px]" />
            </div>
          </template>

          <template v-else>
            <ion-icon
              :icon="tab.icon"
              class="text-[28px] transition-all text-black duration-200"
              :class="isTabActive(tab.route) ? 'text-secondary-glow' : ''"
            />
          </template>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { IonIcon, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs, useIonRouter } from '@ionic/vue'
import { chatbubbleOutline, homeOutline, imagesOutline, personOutline } from 'ionicons/icons'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { masterAnimation, routerAnimation } from '@/helper/animation.helper'
import { useRoute } from 'vue-router'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'

const router = useIonRouter()
const route = useRoute()
const profileImg = ref<string | null>(null)

const tabs = [
  { route: FRONTEND_ROUTES.home, icon: homeOutline },
  { route: FRONTEND_ROUTES.gallery, icon: imagesOutline },
  { route: FRONTEND_ROUTES.chat, icon: chatbubbleOutline },
  { route: FRONTEND_ROUTES.profile, icon: personOutline }
]

onMounted(async () => {
  const { value } = await Preferences.get({ key: LocalStorage.img })
  profileImg.value = value
})

const isTabActive = (tabRoute: string) => route.path.includes(tabRoute)

const handleTabClick = (tabRoute: string) => {
  if (isTabActive(tabRoute)) return
  router.push(`/${tabRoute}`)
}
</script>

<style lang="scss" scoped>
ion-tab-bar {
  --background: var(--ion-color-primary);
}

ion-tab-button {
  --color: rgba(0, 0, 0, 0.4);
  --color-selected: var(--ion-color-secondary);

  /* The bounce animation triggers when our Vue logic adds the class */
  &.tab-selected ion-icon {
    animation: spotifyBounce 0.45s cubic-bezier(0.45, 0.05, 0.55, 0.95);
    color: var(--ion-color-secondary);
  }
}

.text-secondary-glow {
  filter: drop-shadow(0 0 2px rgba(var(--ion-color-secondary-rgb), 0.2));
}

@keyframes spotifyBounce {
  0% {
    transform: scale(1);
  }
  25% {
    transform: scale(0.8);
  }
  60% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}
</style>