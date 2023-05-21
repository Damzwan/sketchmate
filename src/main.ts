import { createApp } from 'vue'
import router from './router'

import { IonicVue } from '@ionic/vue'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

/* Theme variables */
import './theme/variables.css'
import '@/tailwind.css'

import { createPinia } from 'pinia'
import { StatusBar } from '@capacitor/status-bar'
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar'
import mitt from 'mitt'
import { App as CapApp } from '@capacitor/app'
import App from '@/App.vue'
import { useAppStore } from '@/store/app.store'

const pinia = createPinia()
export const EventBus = mitt()
const app = createApp(App).use(IonicVue).use(pinia).use(router)

StatusBar.setBackgroundColor({ color: '#FFAD83' })
// app.config.globalProperties.$statusBar.setBackgroundColor({ color: '#FFAD83' })
NavigationBar.setColor({ color: '#FFAD83' })

app.mount('#app')

CapApp.addListener('appUrlOpen', (data: any) => {
  const url = new URL(data.url)
  const { setQueryParams } = useAppStore()
  setQueryParams(url.searchParams)
})
