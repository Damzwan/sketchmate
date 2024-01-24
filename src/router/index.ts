import { createRouter, createWebHistory } from '@ionic/vue-router'
import { RouteRecordRaw } from 'vue-router'
import TabsPage from '../views/tabs.view.vue'
import { FRONTEND_ROUTES } from '@/types/router.types'

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
        component: () => import(/* webpackPrefetch: true */ '@/views/draw.view.vue')
      },
      {
        path: FRONTEND_ROUTES.gallery,
        component: () => import(/* webpackPrefetch: true */ '@/views/gallery.view.vue')
      },
      {
        path: FRONTEND_ROUTES.connect,
        name: 'Connect',
        component: () => import(/* webpackPrefetch: true */ '@/views/connections.view.vue')
      },
      {
        path: FRONTEND_ROUTES.login,
        component: () => import(/* webpackPrefetch: true */ '@/views/login.view.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})


export default router
