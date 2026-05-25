import { defineStore } from "pinia";
import { ref } from "vue";

type Mode = "initial" | "edit";

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

	return { isOpen, mode, open, resolve, close };
});
