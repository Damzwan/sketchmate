// Composables
import {createRouter, createWebHistory} from 'vue-router'
import Draw from '@/views/draw.view.vue';
import {FRONTEND_ROUTES} from '@/types/app.types';

const routes = [
  {
    path: '/',
    children: [
      {
        path: '/',
        redirect: FRONTEND_ROUTES.draw,
      },
      {
        path: FRONTEND_ROUTES.draw,
        name: 'Draw',
        // route level code-splitting
        // this generates a separate chunk (about.[hash].js) for this route
        // which is lazy-loaded when the route is visited.
        component: Draw,
      },
      {
        path: FRONTEND_ROUTES.messages,
        name: 'Saved',
        component: () => import(/* webpackChunkName: "messages" */ '@/views/messages.view.vue'),
      },
      {
        path: FRONTEND_ROUTES.connect,
        name: 'Settings',
        component: () => import(/* webpackChunkName: "connect" */ '@/views/settings.view.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
})

export default router
