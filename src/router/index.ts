import { createRouter, createWebHistory, NavigationGuard, RouteRecordRaw } from 'vue-router';
import { FRONTEND_ROUTES } from '@/types/app.types';
import { useAppStore } from '@/store/app.store';

const mateRequiredNavigationGuard: NavigationGuard = (to, from, next) => {
  const { user } = useAppStore();
  if (!user!.mate) next(FRONTEND_ROUTES.connect);
  else next();
};

const routes: RouteRecordRaw[] = [
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
        component: () => import(/* webpackChunkName: "draw" */ '@/views/draw.view.vue'),
        beforeEnter: mateRequiredNavigationGuard,
      },
      {
        path: FRONTEND_ROUTES.gallery,
        name: 'Saved',
        component: () => import(/* webpackChunkName: "gallery" */ '@/views/gallery.view.vue'),
        beforeEnter: mateRequiredNavigationGuard,
      },
      {
        path: FRONTEND_ROUTES.connect,
        name: 'Settings',
        component: () => import(/* webpackChunkName: "connect" */ '@/views/connect.view.vue'),
      },
      {
        path: FRONTEND_ROUTES.tutorial,
        name: 'Tutorial',
        component: () => import(/* webpackChunkName: "tutorial" */ '@/views/tutorial.view.vue'),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
