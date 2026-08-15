import { describe, expect, it } from "vitest";
import {
	isSafeReferenceDataUrl,
	MAX_REFERENCE_DATA_URL_CHARS,
} from "./referenceImage";

describe("reference image wire validation", () => {
	it("accepts bounded raster data URLs", () => {
		expect(isSafeReferenceDataUrl("data:image/webp;base64,YQ==")).toBe(true);
		expect(isSafeReferenceDataUrl("data:image/png;base64,YQ==")).toBe(true);
	});

	it("rejects remote URLs, SVG, and oversized payloads", () => {
		expect(isSafeReferenceDataUrl("https://example.com/reference.webp")).toBe(
			false,
		);
		expect(isSafeReferenceDataUrl("data:image/svg+xml;base64,YQ==")).toBe(
			false,
		);
		expect(
			isSafeReferenceDataUrl(
				`data:image/webp;base64,${"a".repeat(MAX_REFERENCE_DATA_URL_CHARS)}`,
			),
		).toBe(false);
	});
});
