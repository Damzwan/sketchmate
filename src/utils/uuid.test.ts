import { afterEach, describe, expect, it, vi } from "vitest";
import { uuidv4 } from "./uuid";

const V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("uuidv4", () => {
	it("uses the native implementation when it exists", () => {
		const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555");
		vi.stubGlobal("crypto", { randomUUID, getRandomValues: vi.fn() });

		expect(uuidv4()).toBe("11111111-2222-4333-8444-555555555555");
		expect(randomUUID).toHaveBeenCalledTimes(1);
	});

	/**
	 * The case that matters: `ionic serve --external` is plain http on a LAN
	 * address, which is not a secure context, so `randomUUID` is absent exactly
	 * when the app is being tested on a real phone.
	 */
	it("falls back to getRandomValues when randomUUID is unavailable", () => {
		const real = globalThis.crypto;
		vi.stubGlobal("crypto", {
			getRandomValues: (a: Uint8Array) => real.getRandomValues(a),
		});

		const id = uuidv4();

		expect(id).toMatch(V4);
	});

	it("sets the version and variant bits in the fallback", () => {
		// All-zero bytes: everything but the version/variant nibbles must be 0,
		// which pins exactly the two bytes the implementation rewrites.
		vi.stubGlobal("crypto", {
			getRandomValues: (a: Uint8Array) => a.fill(0),
		});

		expect(uuidv4()).toBe("00000000-0000-4000-8000-000000000000");
	});

	it("does not repeat", () => {
		const ids = new Set(Array.from({ length: 500 }, () => uuidv4()));
		expect(ids.size).toBe(500);
	});
});
