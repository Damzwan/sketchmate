import { createRouter, createWebHistory } from '@ionic/vue-router'
import { NavigationGuard, RouteRecordRaw } from 'vue-router'
import TabsPage from '../views/tabs.view.vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useAppStore } from '@/store/app.store'
import { useSocketService } from '@/service/api/socket.service'

const hasMateGuard: NavigationGuard = (to, from, next) => {
  const { user } = useAppStore()
  if (!user?.mate) next(FRONTEND_ROUTES.connect)
  else next()
}

const hasNoMateGuard: NavigationGuard = (to, from, next) => {
  const { user } = useAppStore()
  if (user?.mate) next(FRONTEND_ROUTES.draw)
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
        redirect: FRONTEND_ROUTES.connect
      },
      {
        path: FRONTEND_ROUTES.draw,
        component: () => import('@/views/draw.view.vue'),
        beforeEnter: hasMateGuard
      },
      {
        path: FRONTEND_ROUTES.gallery,
        component: () => import('@/views/gallery.view.vue'),
        beforeEnter: hasMateGuard
      },
      {
        path: FRONTEND_ROUTES.mate,
        name: 'Mate',
        component: () => import('@/views/mate.view.vue'),
        beforeEnter: hasMateGuard
      },
      {
        path: FRONTEND_ROUTES.connect,
        component: () => import('@/views/connect.view.vue'),
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
  const { connect } = useSocketService()
  if (!app.isLoggedIn) await connect().then(app.login)
  next()
})

export default router
