import { describe, expect, it } from "vitest";
import {
	hydrateChatCustomization,
	resolveReadableCustomizationPalette,
	resolveTheme,
	resolveWorld,
} from "./profile_options.config";

describe("customized surface contrast", () => {
	it("keeps chat customization independent with safe defaults", () => {
		const chat = hydrateChatCustomization({ themeId: "noir" });

		expect(chat.themeId).toBe("noir");
		expect(Object.keys(chat)).toEqual([
			"themeId",
			"fontId",
			"fontEffectId",
			"backgroundImageUrl",
			"backgroundImageOpacity",
		]);
		expect(chat.fontId).toBe("sketch");
		expect(chat.backgroundImageUrl).toBe("");
		expect(chat.backgroundImageOpacity).toBe(0.12);
		expect(chat).not.toHaveProperty("effectId");
		expect(chat).not.toHaveProperty("worldId");
		expect(chat).not.toHaveProperty("decorationId");
	});

	it("keeps theme text dark on Classic while making Space utilities white", () => {
		const theme = resolveTheme("classic");
		const environment = resolveReadableCustomizationPalette(
			theme,
			resolveWorld("space"),
		);

		expect(environment.isDark).toBe(true);
		expect(environment.name).toBe(theme.nameColorDark);
		expect(environment.utility).toBe("#ffffff");
		expect(environment.controlForeground).toBe("#ffffff");
		expect(environment.controlBg).toContain("0,0,0");
	});

	it("uses white utilities and controls for a dark theme without a world", () => {
		const palette = resolveReadableCustomizationPalette(
			resolveTheme("noir"),
			resolveWorld("none"),
		);

		expect(palette.isDark).toBe(true);
		expect(palette.utility).toBe("#ffffff");
		expect(palette.controlForeground).toBe("#ffffff");
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
