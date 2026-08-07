import { defineStore } from "pinia";
import { ref } from "vue";

// "parental" = the edit flow reached through the parental gate on an
// under-age account: same picker, but the modal explains to the parent which
// social features are currently blocked and what saving an older birthday
// switches on.
type Mode = "initial" | "edit" | "parental";

export const useDateOfBirthModalStore = defineStore("dateOfBirthModal", () => {
	const isOpen = ref(false);
	const mode = ref<Mode>("initial");

	let resolver: ((value: string | null) => void) | null = null;

	function open(m: Mode): Promise<string | null> {
		// If already open (shouldn't happen, but be defensive), resolve the previous
		// caller with null so we don't leave a dangling promise.
		if (resolver) {
			resolver(null);
			resolver = null;
		}

		mode.value = m;
		isOpen.value = true;

		return new Promise<string | null>((res) => {
			resolver = res;
		});
	}

	function resolve(value: string | null) {
		if (resolver) {
			resolver(value);
			resolver = null;
		}
	}

	function close() {
		isOpen.value = false;
	}

	// Resolve rather than drop the pending promise: an awaiting caller that never
	// settles keeps its whole closure alive.
	function resetRuntimeState() {
		resolve(null);
		isOpen.value = false;
		mode.value = "initial";
	}

	return { isOpen, mode, open, resolve, close, resetRuntimeState };
});
