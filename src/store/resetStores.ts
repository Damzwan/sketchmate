import { getActivePinia, type Pinia } from "pinia";

/**
 * Wipe every instantiated store's user-scoped state.
 *
 * Logout used to reset 8 of 22 stores by hand. The other 14 carried the
 * previous account's data straight into the next login — a memory leak, and a
 * privacy bug: account B could see account A's inbox items and chat heads.
 *
 * Every store therefore exposes `resetRuntimeState()`, and logout calls only
 * this. `src/store/storeResetContract.test.ts` asserts that every store module
 * in `src/store/` has one, so a new store cannot be added without deciding what
 * "reset" means for it. That test is the part that keeps this fixed.
 *
 * Only stores that have actually been instantiated are touched. A dormant store
 * holds nothing, and instantiating it here purely to reset it would run its
 * setup — and any store it depends on — during teardown.
 */
export function resetAllStores(pinia: Pinia | undefined = getActivePinia()) {
	if (!pinia) return;

	// `_s` is Pinia's internal id → store map. There is no public equivalent.
	const stores = (pinia as unknown as { _s: Map<string, unknown> })._s;

	for (const [id, store] of stores) {
		const reset = (store as { resetRuntimeState?: () => void })
			.resetRuntimeState;
		if (typeof reset !== "function") continue;
		try {
			reset();
		} catch (e) {
			// One store throwing must not strand the rest mid-logout.
			console.error(`[resetAllStores] "${id}" failed to reset:`, e);
		}
	}
}
