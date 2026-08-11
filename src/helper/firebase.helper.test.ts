import { describe, expect, it } from "vitest";
import { hasDurableSignInProvider } from "./firebase.helper";

describe("hasDurableSignInProvider", () => {
	it("does not treat Firebase's internal native row as a linked account", () => {
		expect(
			hasDurableSignInProvider({
				providerData: [{ providerId: "firebase" }],
			}),
		).toBe(false);
	});

	it("keeps providerless custom-token recovery sessions classified as guests", () => {
		expect(hasDurableSignInProvider({ providerData: [] })).toBe(false);
		expect(
			hasDurableSignInProvider({
				providerData: [{ providerId: "custom" }],
			}),
		).toBe(false);
	});

	it("recognizes real linked providers", () => {
		expect(
			hasDurableSignInProvider({
				providerData: [
					{ providerId: "firebase" },
					{ providerId: "google.com" },
				],
			}),
		).toBe(true);
		expect(
			hasDurableSignInProvider({
				providerData: [{ providerId: "password" }],
			}),
		).toBe(true);
	});
});
