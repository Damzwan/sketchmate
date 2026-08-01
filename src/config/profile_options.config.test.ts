import { describe, expect, it } from "vitest";
import {
	resolveReadableCustomizationPalette,
	resolveTheme,
	resolveWorld,
} from "./profile_options.config";

describe("customized surface contrast", () => {
	it("keeps theme text dark on Classic while making Space utilities white", () => {
		const theme = resolveTheme("classic");
		const themeText = resolveReadableCustomizationPalette(theme);
		const environment = resolveReadableCustomizationPalette(
			theme,
			resolveWorld("space"),
		);

		expect(themeText.name).toBe(theme.nameColor);
		expect(environment.isDark).toBe(true);
		expect(environment.utility).toBe("#ffffff");
	});

	it("uses white utilities and controls for a dark theme without a world", () => {
		const palette = resolveReadableCustomizationPalette(
			resolveTheme("noir"),
			resolveWorld("none"),
		);

		expect(palette.isDark).toBe(true);
		expect(palette.utility).toBe("#ffffff");
		expect(palette.controlBorder).toContain("255,255,255");
	});

	it("keeps light surfaces on dark utility ink", () => {
		const palette = resolveReadableCustomizationPalette(
			resolveTheme("classic"),
			resolveWorld("none"),
		);

		expect(palette.isDark).toBe(false);
		expect(palette.utility).toBe("#18181b");
	});
});
