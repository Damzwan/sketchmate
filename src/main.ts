import { createApp } from 'vue'
import router from './router'

import { IonicVue } from '@ionic/vue'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

/* Theme variables */
import './theme/fonts/fonts.css'
import './theme/theme.scss'
import '@/theme/main.css'

import { createPinia } from 'pinia'
import mitt from 'mitt'
import App from '@/App.vue'
import { addNotificationListeners } from '@/helper/notification.helper'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  initFirebase,
  lazyLoadDrawingModules,
  setupDeeplinkListener,
  setupPwa,
  setupWidget
} from '@/helper/general.helper'

const pinia = createPinia()
initFirebase()

dayjs.extend(relativeTime)

export const EventBus = mitt()
const app = createApp(App).use(IonicVue).use(pinia).use(router)

app.mount('#app')


addNotificationListeners()
lazyLoadDrawingModules()
setupDeeplinkListener()
setupPwa()
setupWidget()
