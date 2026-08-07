import type { PluginListenerHandle } from "@capacitor/core";
import { type ConnectionStatus, Network } from "@capacitor/network";
import { defineStore } from "pinia";
import { ref } from "vue";
import { useToast } from "@/service/toast.service";
import { ToastDuration } from "@/types/toast.types";

export const useNetworkStore = defineStore("network", () => {
	const networkStatus = ref<ConnectionStatus>();

	// `init()` is reachable from more than one boot path. Without this the app
	// stacks a second (third, …) native listener, and every connectivity flip
	// then fires the toast once per registration.
	let listener: PluginListenerHandle | null = null;
	let initializing: Promise<void> | null = null;

	async function init() {
		if (listener) return;
		if (initializing) return initializing;

		initializing = (async () => {
			networkStatus.value = await Network.getStatus();
			const handle = await Network.addListener(
				"networkStatusChange",
				handleNetworkChange,
			);
			// `teardown()` may have run while the handle was pending.
			if (initializing) listener = handle;
			else void handle.remove();
		})();

		try {
			await initializing;
		} finally {
			initializing = null;
		}
	}

	async function teardown() {
		initializing = null;
		const handle = listener;
		listener = null;
		await handle?.remove();
	}

	function handleNetworkChange(status: ConnectionStatus) {
		const { toast } = useToast();

		if (status.connected && !networkStatus.value?.connected) {
			toast("You are now online", {
				color: "success",
				duration: ToastDuration.long,
			});
		} else if (!status.connected) {
			toast("You are now offline", {
				color: "danger",
				duration: ToastDuration.long,
			});
		}

		networkStatus.value = status;
	}

	/**
	 * Deliberately empty. Connectivity is a property of the device, not of the
	 * signed-in account, and clearing it would leave `networkStatus` undefined
	 * with no listener to refill it until the next status change. Present so the
	 * store-reset contract test passes for a considered reason, not an oversight.
	 */
	function resetRuntimeState() {}

	return {
		networkStatus,
		init,
		teardown,
		resetRuntimeState,
	};
});
