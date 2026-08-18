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
		path: `/${FRONTEND_ROUTES.savedPosts}`,
		component: () => import("@/views/savedPosts.view.vue"),
		// Saved posts are public-feed posts, and the feed itself is 13+ (the home
		// view hides it entirely under 13). Same reasoning as the competition
		// route below: the profile entry hides itself, but the path is still
		// reachable by deep link or a restored history entry.
		beforeEnter: async () => {
			const { useAuthStore } = await import("@/store/auth.store");
			const auth = useAuthStore();
			await auth.waitUntilInitialized();
			return auth.isUnderAge ? `/${FRONTEND_ROUTES.home}` : true;
		},
	},
	{
		// Lazy on purpose: the entry grid must not be in the app-start chunk.
		path: `/${FRONTEND_ROUTES.competition}`,
		component: () => import("@/views/competition.view.vue"),
		// 13+ only — the grid is strangers' artwork and strangers' comments on a
		// promoted surface (docs/FAMILIES_POLICY.md, docs/COMPETITION.md §9.4).
		// The home card hides itself, but the route is still reachable directly:
		// a deep link, a notification tap, a restored history entry, or the back
		// stack after a birthday correction. The server refuses the data either
		// way; this is what stops a child landing on an empty competition page
		// full of 403s instead of somewhere they can actually be.
		//
		// `auth.store` imports this module, so the store is pulled in lazily here
		// rather than at the top of the file.
		beforeEnter: async () => {
			const { useAuthStore } = await import("@/store/auth.store");
			const auth = useAuthStore();
			await auth.waitUntilInitialized();
			// Default-deny: `isUnderAge` is already true for an unconfirmed birthday.
			return auth.isUnderAge ? `/${FRONTEND_ROUTES.home}` : true;
		},
	},
];

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes,
});

export default router;
