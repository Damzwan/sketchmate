import { createRouter, createWebHistory } from '@ionic/vue-router'
import { NavigationGuard, RouteRecordRaw } from 'vue-router'
import TabsPage from '../views/tabs.view.vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useAppStore } from '@/store/app.store'
import { useSocketService } from '@/service/api/socket.service'
import { LocalStorage } from '@/types/storage.types'

import { Preferences } from '@capacitor/preferences'

const hasMateGuard: NavigationGuard = async (to, from, next) => {
  const mate = await Preferences.get({ key: LocalStorage.mate })
  if (!mate.value) next(FRONTEND_ROUTES.connect)
  else next()
}

const hasNoMateGuard: NavigationGuard = async (to, from, next) => {
  const mate = await Preferences.get({ key: LocalStorage.mate })
  console.log(mate.value)
  if (mate.value) next(FRONTEND_ROUTES.draw)
  else next()
}

const drawGuard: NavigationGuard = async (to, from, next) => {
  const mate = await Preferences.get({ key: LocalStorage.mate })
  if (!mate.value && !to.query.trial) next(FRONTEND_ROUTES.connect)
  else next()
}

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: FRONTEND_ROUTES.draw
  },
  {
    path: '/',
    component: TabsPage,
    children: [
      {
        path: '',
        redirect: FRONTEND_ROUTES.draw
      },
      {
        path: FRONTEND_ROUTES.draw,
        component: () => import(/* webpackPreload: true */ '@/views/draw.view.vue'),
        beforeEnter: drawGuard
      },
      {
        path: FRONTEND_ROUTES.gallery,
        component: () => import(/* webpackPrefetch: true */ '@/views/gallery.view.vue'),
        beforeEnter: hasMateGuard
      },
      {
        path: FRONTEND_ROUTES.mate,
        name: 'Mate',
        component: () => import(/* webpackPrefetch: true */ '@/views/mate.view.vue'),
        beforeEnter: hasMateGuard
      },
      {
        path: FRONTEND_ROUTES.connect,
        component: () => import(/* webpackPrefetch: true */ '@/views/connect.view.vue'),
        beforeEnter: hasNoMateGuard
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach(async (to, from, next) => {
  const app = useAppStore()
  if (!app.isLoggedIn) {
    const { connect } = useSocketService()
    connect()
    app.login()
  }
  next()
})

export default router
