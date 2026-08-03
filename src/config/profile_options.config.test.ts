import { describe, expect, it } from "vitest";
import {
	CHAT_BACKGROUND_OPACITY_DEFAULT,
	CHAT_BACKGROUND_OPACITY_MAX,
	CHAT_BACKGROUND_OPACITY_MIN,
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
		// The constant, not a literal: the slider reads the same one, and pinning a
		// number here just makes tuning the range a two-file edit that fails first.
		expect(chat.backgroundImageOpacity).toBe(CHAT_BACKGROUND_OPACITY_DEFAULT);
		expect(chat).not.toHaveProperty("effectId");
		expect(chat).not.toHaveProperty("worldId");
		expect(chat).not.toHaveProperty("decorationId");
	});

	it("clamps chat sketch strength to the range the slider offers", () => {
		// The bug this guards: the range ran to 0.50 while hydration capped at 0.35,
		// so the top of the track moved the label and changed nothing on screen.
		expect(
			hydrateChatCustomization({ backgroundImageOpacity: 5 })
				.backgroundImageOpacity,
		).toBe(CHAT_BACKGROUND_OPACITY_MAX);
		expect(
			hydrateChatCustomization({ backgroundImageOpacity: 0 })
				.backgroundImageOpacity,
		).toBe(CHAT_BACKGROUND_OPACITY_MIN);
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
