import { createApp } from 'vue'
import router from './router'

import { IonicVue } from '@ionic/vue'

/* Theme variables */
import './theme/variables.css'
import '@/tailwind.css'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

import { createPinia } from 'pinia'
import mitt from 'mitt'
import { App as CapApp } from '@capacitor/app'
import App from '@/App.vue'
import { useAppStore } from '@/store/app.store'
import { addNotificationListeners } from '@/helper/notification.helper'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import VueJsTour from '@globalhive/vuejs-tour'
import { initFirebase, isNative } from '@/helper/general.helper'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'

const pinia = createPinia()
initFirebase()

const app = createApp(App).use(IonicVue).use(pinia).use(VueJsTour).use(router)


app.mount('#app')


export const EventBus = mitt()
addNotificationListeners()

// lazy loading fabric js dependency for smooth transitions
import('fabric')
import('pako') // preload pako to reduce lag on send

dayjs.extend(relativeTime)
CapApp.addListener('appUrlOpen', async (data: any) => {
  const url = new URL(data.url)
  const { setQueryParams } = useAppStore()
  setQueryParams(url.searchParams)

  const path = url.pathname.substring(1)
  router.push(path)
})

if (!isNative()) {
  window.addEventListener('load', () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'client-ready'
      })
    }
  })
}

// used for our widget to retrieve the list of friends
const baseUrl = import.meta.env.VITE_BACKEND as string
Preferences.set({ key: LocalStorage.backend_url, value: baseUrl })
