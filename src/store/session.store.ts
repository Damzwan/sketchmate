import { defineStore } from "pinia";
import { ref } from "vue";

export const useSessionStore = defineStore("session", () => {
	const queryParams = ref<URLSearchParams>();
	const installPrompt = ref<any>();
	const updateSlide = ref(false);
	const userDeletedError = ref(false);
	const redirectIntent = ref("");

	function setQueryParams(params: URLSearchParams | undefined) {
		queryParams.value = params;
	}

	function setInstallPrompt(prompt: any) {
		installPrompt.value = prompt;
	}

	function setUpdateSlide(value: boolean) {
		updateSlide.value = value;
	}

	function setUserDeletedError(value: boolean) {
		userDeletedError.value = value;
	}

	/**
	 * `installPrompt` and `queryParams` survive: both belong to this browsing
	 * session/install rather than to the account, and the beforeinstallprompt
	 * event fires once — dropping it means the PWA install button never works
	 * again this session.
	 */
	function resetRuntimeState() {
		updateSlide.value = false;
		userDeletedError.value = false;
		redirectIntent.value = "";
	}

	return {
		queryParams,
		installPrompt,
		updateSlide,
		userDeletedError,

		setQueryParams,
		setInstallPrompt,
		setUpdateSlide,
		setUserDeletedError,
		redirectIntent,
		resetRuntimeState,
	};
});
