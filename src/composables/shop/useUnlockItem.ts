import { ref } from "vue";
import { useSubscriptionStore } from "@/store/subscription.store";

/**
 * Direct purchase from a customization picker, so a locked item can be bought
 * in place instead of bouncing the user out to the shop. `purchaseSku` handles
 * the RC flow, optimistic inventory grant, toast + confetti; we just expose a
 * `purchasing` flag and resolve to whether it succeeded.
 */
export function useUnlockItem() {
	const purchasing = ref(false);
	const sub = useSubscriptionStore();

	const unlockItem = async (itemId: string): Promise<boolean> => {
		if (purchasing.value) return false;
		purchasing.value = true;
		try {
			return await sub.purchaseSku(itemId);
		} finally {
			purchasing.value = false;
		}
	};

	return { purchasing, unlockItem };
}
