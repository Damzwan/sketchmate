import { createRouter, createWebHistory } from '@ionic/vue-router'
import TabsPage from '../views/tabs.view.vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { RouteRecordRaw } from 'vue-router'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    component: TabsPage,
    children: [
      {
        path: '',
        redirect: FRONTEND_ROUTES.home
      },
      {
        path: FRONTEND_ROUTES.home,
        component: () => import('@/views/home.view.vue')
      },
      {
        path: FRONTEND_ROUTES.gallery,
        component: () => import('@/views/gallery.view.vue')
      },
      {
        path: FRONTEND_ROUTES.chat,
        component: () => import('@/views/chat.view.vue')
      },
      {
        path: FRONTEND_ROUTES.profile,
        component: () => import('@/views/profile.view.vue')
      }
    ]
  },
  // Full-screen views MUST have a leading slash
  {
    path: `/${FRONTEND_ROUTES.draw}`,
    component: () => import('@/views/draw.view.vue')
  },
  {
    path: `/${FRONTEND_ROUTES.settings}`,
    component: () => import('@/views/settings.view.vue')
  },
  {
    path: `/${FRONTEND_ROUTES.login}`,
    component: () => import('@/views/login.view.vue')
  }
]
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router