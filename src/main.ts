import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

import { IonicVue } from '@ionic/vue'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

/* Basic CSS for apps built with Ionic */
// import '@ionic/vue/css/normalize.css'
// import '@ionic/vue/css/structure.css'
// import '@ionic/vue/css/typography.css'

import { defineCustomElements } from '@ionic/pwa-elements/loader'

/* Theme variables */
import './theme/variables.css'
import '@/tailwind.css'

import { createPinia } from 'pinia'
import { StatusBar } from '@capacitor/status-bar'
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar'
import mitt from 'mitt'

const pinia = createPinia()
export const EventBus = mitt()
const app = createApp(App).use(IonicVue).use(pinia).use(router)

StatusBar.setBackgroundColor({ color: '#FFAD83' })
// app.config.globalProperties.$statusBar.setBackgroundColor({ color: '#FFAD83' })
NavigationBar.setColor({ color: '#FFAD83' })

app.mount('#app')
