import { type ComputedRef, computed, reactive, ref } from "vue";

/**
 * Email + password + confirm-password validation for the two credential forms
 * (LoginMainPage, UpgradeAccountModal), which had byte-identical Vuelidate
 * rules duplicated between them.
 *
 * Replaces `@vuelidate/core` + `@vuelidate/validators`. Those are two
 * unmaintained packages carried for four rules — required, email, minLength(8)
 * and sameAs — on two forms. A schema library (zod et al) would be the same
 * trade with a different name: worth it the day something validates an API
 * payload, not for this.
 *
 * The exposed shape deliberately mirrors Vuelidate's (`$errors` with `$uid` /
 * `$message`, `$validate`, `$invalid`, `$reset`) so the templates did not have
 * to be rewritten around a new API.
 */

export interface ValidationError {
	$uid: string;
	$message: string;
}

export interface FieldValidation {
	/** Populated only once the field is dirty — same as Vuelidate. */
	$errors: ValidationError[];
	/** True whenever the value fails, dirty or not. Drives submit buttons. */
	$invalid: boolean;
	/** Marks the field dirty and reports validity. Called from `@ionBlur`. */
	$validate: () => boolean;
	$dirty: boolean;
}

export interface CredentialsState {
	loginEmail: string;
	password: string;
	confirmPassword: string;
}

type FieldName = keyof CredentialsState;

export const MIN_PASSWORD_LENGTH = 8;

// Deliberately permissive: the authoritative check is the identity provider's.
// A stricter pattern here only ever rejects addresses that would have worked.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messagesFor(field: FieldName, state: CredentialsState): string[] {
	const value = state[field];
	const messages: string[] = [];

	if (!value) {
		messages.push("Value is required");
		return messages;
	}

	if (field === "loginEmail" && !EMAIL_PATTERN.test(value)) {
		messages.push("Value is not a valid email address");
	}

	if (field !== "loginEmail" && value.length < MIN_PASSWORD_LENGTH) {
		messages.push(
			`This field should be at least ${MIN_PASSWORD_LENGTH} characters long`,
		);
	}

	if (field === "confirmPassword" && value !== state.password) {
		messages.push("The value must be equal to the password");
	}

	return messages;
}

export function useCredentialsValidation() {
	const state = reactive<CredentialsState>({
		loginEmail: "",
		password: "",
		confirmPassword: "",
	});

	const dirty = ref<Record<FieldName, boolean>>({
		loginEmail: false,
		password: false,
		confirmPassword: false,
	});

	const field = (name: FieldName): ComputedRef<FieldValidation> =>
		computed(() => {
			const messages = messagesFor(name, state);
			const isDirty = dirty.value[name];
			return {
				$dirty: isDirty,
				$invalid: messages.length > 0,
				$errors: isDirty
					? messages.map((message, i) => ({
							$uid: `${name}-${i}`,
							$message: message,
						}))
					: [],
				$validate: () => {
					dirty.value[name] = true;
					return messages.length === 0;
				},
			};
		});

	const loginEmail = field("loginEmail");
	const password = field("password");
	const confirmPassword = field("confirmPassword");

	const v$ = computed(() => ({
		loginEmail: loginEmail.value,
		password: password.value,
		confirmPassword: confirmPassword.value,
		/** Marks every field dirty, then reports whether all of them pass. */
		$validate: () => {
			let valid = true;
			for (const name of Object.keys(dirty.value) as FieldName[]) {
				dirty.value[name] = true;
				if (messagesFor(name, state).length > 0) valid = false;
			}
			return valid;
		},
		/** Clears the messages without clearing what the user typed. */
		$reset: () => {
			dirty.value = {
				loginEmail: false,
				password: false,
				confirmPassword: false,
			};
		},
	}));

	return { state, v$ };
}
