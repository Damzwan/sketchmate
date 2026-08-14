import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	native: true,
	configureCalls: 0,
	configureGate: undefined as (() => void) | undefined,
	logInCalls: [] as string[],
	logInGate: undefined as (() => void) | undefined,
	logInFails: false,
	logOutCalls: 0,
	order: [] as string[],
	customerInfoListener: undefined as ((info: unknown) => void) | undefined,
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
	Purchases: {
		configure: vi.fn(async () => {
			state.configureCalls++;
			if (state.configureGate) {
				await new Promise<void>((resolve) => {
					state.configureGate = resolve;
				});
			}
		}),
		logIn: vi.fn(async ({ appUserID }: { appUserID: string }) => {
			state.logInCalls.push(appUserID);
			if (state.logInGate) {
				await new Promise<void>((resolve) => {
					state.logInGate = resolve;
				});
			}
			if (state.logInFails) throw new Error("logIn boom");
			state.order.push(`logIn:${appUserID}`);
			return { customerInfo: {}, created: false };
		}),
		logOut: vi.fn(async () => {
			state.logOutCalls++;
			state.order.push("logOut");
			return { customerInfo: {} };
		}),
		addCustomerInfoUpdateListener: vi.fn(async (listener: any) => {
			state.customerInfoListener = listener;
			return "callback-id";
		}),
	},
}));

vi.mock("@/helper/platform.helper", () => ({
	isNative: () => state.native,
}));

async function loadBilling() {
	vi.resetModules();
	return import("@/helper/billing.helper");
}

beforeEach(() => {
	state.native = true;
	state.configureCalls = 0;
	state.configureGate = undefined;
	state.logInCalls = [];
	state.logInGate = undefined;
	state.logInFails = false;
	state.logOutCalls = 0;
	state.order = [];
	state.customerInfoListener = undefined;
	vi.stubEnv("VITE_ENVIRONMENT", "dev");
	vi.stubEnv("VITE_REVENUECAT_TEST_KEY", "test-key");
});

describe("billing identity", () => {
	it("configures once no matter how many callers ask for it", async () => {
		const billing = await loadBilling();

		await Promise.all([
			billing.initBilling(),
			billing.initBilling(),
			billing.waitForBilling(),
		]);

		expect(state.configureCalls).toBe(1);
	});

	// The bug this whole module exists for: entitlements read before `logIn`
	// lands describe the anonymous customer, so a paying user looked free until
	// the next cold start.
	it("does not report identified until logIn resolves", async () => {
		const billing = await loadBilling();
		state.logInGate = () => undefined;

		void billing.identifyBillingUser("user-a");
		const pending = billing.waitForBilling();

		// logIn is in flight — nothing may claim the identity yet.
		await Promise.resolve();
		expect(billing.isBillingIdentified()).toBe(false);

		state.logInGate?.();
		state.logInGate = undefined;
		expect(await pending).toBe(true);
		expect(billing.isBillingIdentified()).toBe(true);
	});

	it("reports not identified when logIn fails", async () => {
		const billing = await loadBilling();
		state.logInFails = true;

		await billing.identifyBillingUser("user-a");

		expect(await billing.waitForBilling()).toBe(false);
		expect(billing.isBillingIdentified()).toBe(false);
	});

	it("keeps logout and the next login in order", async () => {
		const billing = await loadBilling();

		await billing.identifyBillingUser("user-a");
		// Both unawaited, exactly as the auth store fires them.
		void billing.resetBillingUser();
		void billing.identifyBillingUser("user-b");

		expect(await billing.waitForBilling()).toBe(true);
		expect(state.order).toEqual(["logIn:user-a", "logOut", "logIn:user-b"]);
	});

	it("drops the identity on logout", async () => {
		const billing = await loadBilling();

		await billing.identifyBillingUser("user-a");
		await billing.resetBillingUser();

		expect(state.logOutCalls).toBe(1);
		expect(billing.isBillingIdentified()).toBe(false);
	});

	it("waits for a re-chained identity rather than the one captured on entry", async () => {
		const billing = await loadBilling();

		await billing.identifyBillingUser("user-a");
		state.logInGate = () => undefined;
		void billing.identifyBillingUser("user-b");

		const pending = billing.waitForBilling();
		await Promise.resolve();
		state.logInGate?.();
		state.logInGate = undefined;

		expect(await pending).toBe(true);
		expect(state.logInCalls).toEqual(["user-a", "user-b"]);
	});

	it("fans customerInfo updates out to subscribers", async () => {
		const billing = await loadBilling();
		const seen: unknown[] = [];

		await billing.initBilling();
		const unsubscribe = billing.onCustomerInfoUpdate((info) => seen.push(info));

		state.customerInfoListener?.({ entitlements: { active: {} } });
		unsubscribe();
		state.customerInfoListener?.({ entitlements: { active: {} } });

		expect(seen).toHaveLength(1);
	});

	it("is a no-op off native", async () => {
		state.native = false;
		const billing = await loadBilling();

		await billing.initBilling();
		await billing.identifyBillingUser("user-a");

		expect(state.configureCalls).toBe(0);
		expect(state.logInCalls).toEqual([]);
		expect(await billing.waitForBilling()).toBe(false);
	});
});
