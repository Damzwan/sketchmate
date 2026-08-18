import { afterEach, describe, expect, it } from "vitest";
import { installLegacyPolyfills } from "./polyfills";

const nativeHasOwn = Object.hasOwn;

afterEach(() => {
	Object.defineProperty(Object, "hasOwn", {
		configurable: true,
		writable: true,
		value: nativeHasOwn,
	});
});

describe("legacy runtime polyfills", () => {
	it("installs Object.hasOwn without trusting an object's prototype", () => {
		delete (Object as { hasOwn?: typeof Object.hasOwn }).hasOwn;
		installLegacyPolyfills();

		const inherited = { inherited: true };
		const value = Object.create(inherited) as { own?: boolean };
		value.own = true;

		expect(Object.hasOwn(value, "own")).toBe(true);
		expect(Object.hasOwn(value, "inherited")).toBe(false);
	});
});
