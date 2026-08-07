import { beforeEach, describe, expect, it, vi } from "vitest";

// The real auth store drags in the router and firebase on import; this suite is
// about the field pick, not about who is signed in.
const user: { value: { profanity_filter?: boolean } | null } = { value: null };
vi.mock("@/store/auth.store", () => ({
	useAuthStore: () => ({
		get user() {
			return user.value;
		},
	}),
}));

const { isProfanityFilterOn, safeText } = await import(
	"@/helper/profanity.helper"
);

describe("profanity helper", () => {
	beforeEach(() => {
		user.value = { profanity_filter: true };
	});

	it("treats a missing preference as filtered", () => {
		user.value = {};
		expect(isProfanityFilterOn()).toBe(true);
		expect(safeText("you suck", "you ****")).toBe("you ****");
	});

	it("renders the censored twin when the filter is on", () => {
		expect(safeText("you suck", "you ****")).toBe("you ****");
	});

	it("renders the original when the filter is off", () => {
		user.value = { profanity_filter: false };
		expect(safeText("you suck", "you ****")).toBe("you suck");
	});

	it("passes clean text through — no twin means nothing matched", () => {
		expect(safeText("hello there", undefined)).toBe("hello there");
		expect(safeText("hello there", null)).toBe("hello there");
	});

	it("never renders undefined", () => {
		expect(safeText(undefined, undefined)).toBe("");
		expect(safeText(null, null)).toBe("");
	});

	it("survives no signed-in user", () => {
		user.value = null;
		expect(isProfanityFilterOn()).toBe(true);
		expect(safeText("raw", "censored")).toBe("censored");
	});
});
