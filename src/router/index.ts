// Composables
import {createRouter, createWebHistory} from 'vue-router'
import {FRONTEND_ROUTES} from '@/types/app.types';
import Draw from '@/views/draw.view.vue';
import Messages from '@/views/gallery.view.vue';
import Connect from '@/views/connect.view.vue';

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
        component: () => import(/* webpackChunkName: "messages" */ '@/views/draw.view.vue'),
      },
      {
        path: FRONTEND_ROUTES.gallery,
        name: 'Saved',
        component: () => import(/* webpackChunkName: "messages" */ '@/views/gallery.view.vue'),
      },
      {
        path: FRONTEND_ROUTES.connect,
        name: 'Settings',
        component: () => import(/* webpackChunkName: "connect" */ '@/views/connect.view.vue'),
      },
      {
        path: FRONTEND_ROUTES.tutorial,
        name: 'Tutorial',
        component: () => import(/* webpackChunkName: "connect" */ '@/views/tutorial.view.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
})

export default router
