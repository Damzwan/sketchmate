import { createRouter, createWebHistory } from "@ionic/vue-router";
import type { RouteRecordRaw } from "vue-router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import TabsPage from "../views/tabs.view.vue";

const routes: Array<RouteRecordRaw> = [
	{
		path: "/",
		component: TabsPage,
		children: [
			{
				path: "",
				redirect: FRONTEND_ROUTES.home,
			},
			{
				path: FRONTEND_ROUTES.home,
				component: () => import("@/views/home.view.vue"),
			},
			{
				path: FRONTEND_ROUTES.gallery,
				component: () => import("@/views/gallery.view.vue"),
			},
			{
				path: FRONTEND_ROUTES.profile,
				component: () => import("@/views/profile.view.vue"),
			},
		],
	},

	// --- Main Full Screen Views ---
	{
		path: `/${FRONTEND_ROUTES.draw}`,
		component: () => import("@/views/draw.view.vue"),
		meta: { useSlideTransition: true },
	},
	{
		path: `/${FRONTEND_ROUTES.settings}`,
		component: () => import("@/views/settings.view.vue"),
	},
	{
		path: `/${FRONTEND_ROUTES.network}`,
		component: () => import("@/views/network.view.vue"),
	},
	{
		path: `/${FRONTEND_ROUTES.login}`,
		component: () => import("@/views/login.view.vue"),
	},
	{
		path: `/${FRONTEND_ROUTES.customization}`,
		component: () => import("@/views/customization.view.vue"),
	},
	{
		path: `/${FRONTEND_ROUTES.moderation}`,
		component: () => import("@/views/moderation.view.vue"),
	},
	{
		path: `/${FRONTEND_ROUTES.notifications}`,
		component: () => import("@/views/notification.view.vue"),
	},
	{
		// Lazy on purpose: the entry grid must not be in the app-start chunk.
		path: `/${FRONTEND_ROUTES.competition}`,
		component: () => import("@/views/competition.view.vue"),
	},
];

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes,
});

export default router;
