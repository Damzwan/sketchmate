import { Preferences } from "@capacitor/preferences";
import {
	FirebaseAuthentication,
	type SignInResult,
} from "@capacitor-firebase/authentication";
import { computed, ref, watch } from "vue";
import { useCredentialsValidation } from "@/composables/general/useCredentialsValidation";
import { isNative } from "@/helper/platform.helper";
import { redeemGuestRecovery } from "@/service/api/guestRecovery.api";
import {
	clearGuestRecovery,
	readGuestRecovery,
	type StoredGuestRecovery,
} from "@/service/guestRecovery.service";
import { useToast } from "@/service/toast.service";
import { LocalStorage } from "@/types/storage.types";
import { ToastDuration } from "@/types/toast.types";

const GENERIC_ERROR =
	"Something went wrong, please try again later. If this issue persists contact me.";

export function useLoginActions() {
	const { toast } = useToast();
	const { state, v$ } = useCredentialsValidation();
	const loginErrorMsg = ref("");
	const loginLoading = ref(false);
	const googleloading = ref(false);
	const anonymousLoading = ref(false);
	const forgotPassword = ref(false);
	const forgotPasswordSent = ref(false);
	const isRegistering = ref(false);
	const guestRecovery = ref<StoredGuestRecovery | null>(null);
	const guestRecoveryLoading = ref(false);
	const guestRecoveryError = ref("");

	void refreshGuestRecovery();

	const isLoginInValid = computed(
		() => v$.value.loginEmail.$invalid || v$.value.password.$invalid,
	);
	const isForgetPasswordInvalid = computed(() => v$.value.loginEmail.$invalid);
	const isRegisterInvalid = computed(
		() =>
			v$.value.loginEmail.$invalid ||
			v$.value.password.$invalid ||
			v$.value.confirmPassword.$invalid,
	);

	watch([isRegistering, forgotPassword], () => {
		v$.value.$reset();
		loginErrorMsg.value = "";
	});

	async function onPasswordForget() {
		try {
			await v$.value.$validate();
			if (isForgetPasswordInvalid.value) return;
			loginLoading.value = true;
			await FirebaseAuthentication.sendPasswordResetEmail({
				email: state.loginEmail,
			});
			forgotPasswordSent.value = true;
		} catch {
			loginErrorMsg.value = "Email not found";
		} finally {
			loginLoading.value = false;
		}
	}

	async function onEmailLoginSubmit() {
		void rememberLogin();
		await v$.value.$validate();
		if (isRegistering.value) return register();
		if (isLoginInValid.value) return;

		try {
			loginLoading.value = true;
			await onLoginResult(
				await FirebaseAuthentication.signInWithEmailAndPassword({
					email: state.loginEmail,
					password: state.password,
				}),
			);
		} catch (error: any) {
			loginErrorMsg.value = loginError(error);
			loginLoading.value = false;
		}
	}

	async function register() {
		if (isRegisterInvalid.value) return;
		try {
			loginLoading.value = true;
			await onLoginResult(
				await FirebaseAuthentication.createUserWithEmailAndPassword({
					email: state.loginEmail,
					password: state.password,
				}),
			);
		} catch (error: any) {
			loginErrorMsg.value = [
				"auth/email-already-in-use",
				"email-already-in-use",
			].includes(error.code)
				? "Account already exists, try logging in instead."
				: GENERIC_ERROR;
			loginLoading.value = false;
		}
	}

	async function onGoogleLogin() {
		void rememberLogin();
		if (isNative()) setTimeout(() => (googleloading.value = true), 1500);
		else googleloading.value = true;
		try {
			await onLoginResult(await FirebaseAuthentication.signInWithGoogle());
		} catch {
			showProviderError();
		} finally {
			googleloading.value = false;
		}
	}

	async function onAnonymousLogin() {
		void rememberLogin();
		try {
			anonymousLoading.value = true;
			await onLoginResult(await FirebaseAuthentication.signInAnonymously());
		} catch {
			showProviderError();
			anonymousLoading.value = false;
		}
	}

	async function refreshGuestRecovery() {
		guestRecovery.value = await readGuestRecovery();
	}

	async function recoverGuestAccount() {
		if (!guestRecovery.value || guestRecoveryLoading.value) return;
		guestRecoveryLoading.value = true;
		guestRecoveryError.value = "";
		try {
			const recovery = await redeemGuestRecovery({
				credentialId: guestRecovery.value.credentialId,
				secret: guestRecovery.value.secret,
			});
			await Promise.all([
				Preferences.set({ key: LocalStorage.login, value: "true" }),
				Preferences.set({
					key: LocalStorage.recoveredGuestSession,
					value: guestRecovery.value.guestUid,
				}),
				Preferences.remove({
					key: LocalStorage.guestRecoveryLinkRequired,
				}),
				Preferences.remove({ key: LocalStorage.guestUpgradeDismissed }),
			]);
			await onLoginResult(
				await FirebaseAuthentication.signInWithCustomToken({
					token: recovery.customToken,
				}),
			);
		} catch (error) {
			console.warn("Guest recovery failed:", error);
			await Promise.all([
				Preferences.remove({ key: LocalStorage.recoveredGuestSession }),
				Preferences.remove({
					key: LocalStorage.guestRecoveryLinkRequired,
				}),
			]);
			guestRecoveryError.value =
				"We couldn't recover this guest profile. You can forget it and start again, or contact support.";
		} finally {
			guestRecoveryLoading.value = false;
		}
	}

	async function forgetGuestRecovery() {
		await clearGuestRecovery();
		guestRecovery.value = null;
		guestRecoveryError.value = "";
	}

	async function onLoginResult(result: SignInResult) {
		if (result.user) return;
		loginLoading.value = false;
		googleloading.value = false;
		anonymousLoading.value = false;
		showProviderError();
	}

	function showProviderError() {
		toast("Something went wrong, try again later", {
			color: "danger",
			duration: ToastDuration.medium,
		});
	}

	return {
		state,
		v$,
		loginErrorMsg,
		loginLoading,
		googleloading,
		anonymousLoading,
		forgotPassword,
		forgotPasswordSent,
		isRegistering,
		guestRecovery,
		guestRecoveryLoading,
		guestRecoveryError,
		isLoginInValid,
		isForgetPasswordInvalid,
		isRegisterInvalid,
		onPasswordForget,
		onEmailLoginSubmit,
		onGoogleLogin,
		onAnonymousLogin,
		recoverGuestAccount,
		forgetGuestRecovery,
	};
}

function rememberLogin() {
	return Preferences.set({ key: LocalStorage.login, value: "true" });
}

function loginError(error: any): string {
	if (
		error.code === "auth/invalid-login-credentials" ||
		error.message?.includes("INVALID_LOGIN_CREDENTIALS")
	)
		return "Account not found or wrong password.";
	if (error.code === "auth/too-many-requests")
		return "Too many attempts, try again later.";
	return GENERIC_ERROR;
}
