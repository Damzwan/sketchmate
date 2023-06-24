import { createApp } from 'vue'
import router from './router'

import { IonicVue } from '@ionic/vue'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

/* Theme variables */
import './theme/variables.css'
import '@/tailwind.css'

import { createPinia } from 'pinia'
import mitt from 'mitt'
import { App as CapApp } from '@capacitor/app'
import App from '@/App.vue'
import { useAppStore } from '@/store/app.store'
import { addNotificationListeners } from '@/helper/notification.helper'
import { SplashScreen } from '@capacitor/splash-screen'
import { setAppColors } from '@/helper/general.helper'
import { colorsPerRoute } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { LocalStorage } from '@/types/storage.types'

const pinia = createPinia()
export const EventBus = mitt()
const app = createApp(App).use(IonicVue).use(pinia).use(router)

addNotificationListeners()

app.mount('#app')

router.isReady().then(async () => {
  await SplashScreen.hide()

  // TODO kind of hacky
  setTimeout(() => {
    localStorage.getItem(LocalStorage.mate)
      ? setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
      : setAppColors(colorsPerRoute[FRONTEND_ROUTES.connect])
  }, 190)
})

CapApp.addListener('appUrlOpen', (data: any) => {
  const url = new URL(data.url)
  const { setQueryParams } = useAppStore()
  setQueryParams(url.searchParams)
})
