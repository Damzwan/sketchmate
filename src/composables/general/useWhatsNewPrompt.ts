import { storeToRefs } from "pinia";
import { onScopeDispose, watch } from "vue";
import { useRoute } from "vue-router";
import { compareVersions } from "@/helper/general.helper";
import { updateUser } from "@/service/api/user.api";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

/**
 * Owns the release-note decision without importing the visual modal (and its
 * large developer image) into the app shell.
 */
export function useWhatsNewPrompt() {
	const authStore = useAuthStore();
	const menuStore = useMenuStore();
	const route = useRoute();
	const { user, isLoggedIn } = storeToRefs(authStore);
	let promptTimer: ReturnType<typeof setTimeout> | null = null;

	const clearPromptTimer = () => {
		if (!promptTimer) return;
		clearTimeout(promptTimer);
		promptTimer = null;
	};

	const markVersionSeen = () => {
		if (!user.value) return;
		user.value.last_seen_version = __APP_VERSION__;
		void updateUser({
			_id: user.value._id,
			last_seen_version: __APP_VERSION__,
		});
	};

	watch(
		[user, isLoggedIn, () => route.path],
		([currentUser, loggedIn, path]) => {
			clearPromptTimer();
			if (
				!loggedIn ||
				!currentUser ||
				path === `/${FRONTEND_ROUTES.login}` ||
				menuStore.isWhatsNewOpen
			)
				return;

			const lastSeen = currentUser.last_seen_version;
			if (!lastSeen) {
				markVersionSeen();
				return;
			}
			if (compareVersions(__APP_VERSION__, lastSeen) !== 1) return;

			const userId = currentUser._id;
			markVersionSeen();
			promptTimer = setTimeout(() => {
				promptTimer = null;
				if (
					authStore.user?._id === userId &&
					authStore.isLoggedIn &&
					route.path !== `/${FRONTEND_ROUTES.login}`
				) {
					menuStore.isWhatsNewOpen = true;
				}
			}, 2000);
		},
		{ immediate: true },
	);

	onScopeDispose(clearPromptTimer);
}
