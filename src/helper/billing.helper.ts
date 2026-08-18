import { type CustomerInfo, Purchases } from "@revenuecat/purchases-capacitor";
import { isNative } from "@/helper/platform.helper";

/**
 * RevenueCat lifecycle + identity.
 *
 * The SDK is configured once at boot and re-identified on every login. Both are
 * async, and both used to be fire-and-forget: `getCustomerInfo()` could run
 * while RC still held the anonymous (or previous) appUserID and answer with an
 * empty entitlement set. A paying user then looked free for the whole session —
 * until the next cold start, where `configure` restores the identified user
 * from RC's own cache and the read happens to be correct.
 *
 * So: identity changes are serialised through one promise chain, and anything
 * reading entitlements waits on `waitForBilling()` first.
 */

let configureState: "unconfigured" | "ready" | "failed" = "unconfigured";
let configurePromise: Promise<void> | undefined;

// Serialises identity changes, so a logout can never overtake the login it
// follows (or vice versa) no matter how the call sites schedule them.
let identityPromise: Promise<void> = Promise.resolve();
// False until a logIn for the current account has landed. Guards the two things
// that are only meaningful once RC points at the right customer: writing the
// tier back to our own backend, and trusting pushed customerInfo updates.
let identityOk = false;

const customerInfoListeners = new Set<(info: CustomerInfo) => void>();
let listenerRegistered = false;

async function registerCustomerInfoListener() {
	if (listenerRegistered) return;
	listenerRegistered = true;
	try {
		await Purchases.addCustomerInfoUpdateListener((info) => {
			for (const listener of customerInfoListeners) {
				try {
					listener(info);
				} catch (e) {
					console.error("[billing] customerInfo listener threw", e);
				}
			}
		});
	} catch (e) {
		listenerRegistered = false;
		console.error("[billing] could not register customerInfo listener", e);
	}
}

/**
 * Subscribe to RC-pushed entitlement changes (renewal, expiry, refund, a
 * purchase made outside the app). Returns an unsubscribe function.
 */
export function onCustomerInfoUpdate(
	listener: (info: CustomerInfo) => void,
): () => void {
	customerInfoListeners.add(listener);
	return () => {
		customerInfoListeners.delete(listener);
	};
}

export async function initBilling(): Promise<void> {
	if (!isNative()) return;
	if (configurePromise) return configurePromise;

	const env = import.meta.env.VITE_ENVIRONMENT;
	const testKey =
		env === "prod"
			? import.meta.env.VITE_REVENUECAT_ANDROID_KEY
			: import.meta.env.VITE_REVENUECAT_TEST_KEY;

	if (!testKey) {
		console.error("Missing RevenueCat Test Key! Check your .env file.");
		configureState = "failed";
		return;
	}

	configurePromise = (async () => {
		try {
			await Purchases.configure({ apiKey: testKey });
			configureState = "ready";
			await registerCustomerInfoListener();
		} catch (error) {
			configureState = "failed";
			console.error("Error configuring RevenueCat:", error);
		}
	})();

	return configurePromise;
}

/**
 * Point RC at this account. Safe to call unawaited — every reader goes through
 * `waitForBilling()`, and the identity chain keeps ordering intact.
 */
export function identifyBillingUser(appUserID: string): Promise<void> {
	if (!isNative()) return Promise.resolve();

	identityPromise = identityPromise.then(async () => {
		await initBilling();
		if (configureState !== "ready") {
			identityOk = false;
			return;
		}
		try {
			await Purchases.logIn({ appUserID });
			identityOk = true;
		} catch (e) {
			identityOk = false;
			console.error("[billing] logIn failed", e);
		}
	});

	return identityPromise;
}

/**
 * Drop the RC identity on logout, so the next account on this device can't read
 * the previous one's entitlements in the window before its own logIn lands.
 */
export function resetBillingUser(): Promise<void> {
	if (!isNative()) return Promise.resolve();

	identityPromise = identityPromise.then(async () => {
		identityOk = false;
		if (configureState !== "ready") return;
		try {
			await Purchases.logOut();
		} catch (e) {
			// Already anonymous is one of the rejections here — nothing to do.
			console.warn("[billing] logOut failed", e);
		}
	});

	return identityPromise;
}

/** Synchronous view of the same state `waitForBilling()` resolves to. */
export function isBillingIdentified(): boolean {
	return configureState === "ready" && identityOk;
}

/** Cap on how long a caller will sit on a stalled configure/logIn round trip. */
const BILLING_WAIT_TIMEOUT_MS = 10_000;

/**
 * Resolves once RC is configured and its identity has settled.
 * @returns whether entitlements can be trusted as this account's.
 */
export async function waitForBilling(): Promise<boolean> {
	if (!isNative()) return false;

	// Bounded: `logIn` is a network call, and a caller stuck behind a dead
	// connection would otherwise never clear its loading state. On timeout we
	// report "not identified", which only suppresses the write-back — the
	// entitlement read still happens against whatever RC has cached.
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, BILLING_WAIT_TIMEOUT_MS);
	});

	try {
		await Promise.race([
			(async () => {
				await initBilling();
				// Identity can be re-chained while we await it, so settle on the
				// latest link rather than the one captured on entry.
				let awaited: Promise<void> | undefined;
				while (awaited !== identityPromise) {
					awaited = identityPromise;
					await awaited;
				}
			})(),
			timeout,
		]);
	} finally {
		clearTimeout(timer);
	}

	return isBillingIdentified();
}
