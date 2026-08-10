import { describe, expect, it } from "vitest";
import {
	CHAT_BACKGROUND_OPACITY_DEFAULT,
	CHAT_BACKGROUND_OPACITY_MAX,
	CHAT_BACKGROUND_OPACITY_MIN,
	FONTS,
	hydrateChatCustomization,
	PROFILE_UI_FONT_FAMILY,
	resolveFontFor,
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

	it("uses white utilities and controls for a dark theme", () => {
		const palette = resolveReadableCustomizationPalette(resolveTheme("noir"));

		expect(palette.isDark).toBe(true);
		expect(palette.utility).toBe("#ffffff");
		expect(palette.controlForeground).toBe("#ffffff");
		expect(palette.controlBorder).toContain("255,255,255");
	});

	it("keeps light surfaces on dark utility ink", () => {
		const theme = resolveTheme("classic");
		const palette = resolveReadableCustomizationPalette(theme);

		expect(palette.isDark).toBe(false);
		expect(palette.name).toBe(theme.nameColor);
		expect(palette.utility).toBe("#18181b");
	});

	it("does not let an equipped world flip the theme's contrast", () => {
		// Cosmic Drift used to declare itself dark, which dragged names, utility
		// ink and control chrome onto a dark palette for users on a LIGHT theme —
		// everywhere their profile appeared. Scenes tint to the surface now, so
		// the catalog carries no darkness knob for anyone to re-wire.
		expect(resolveWorld("space")).not.toHaveProperty("isDark");

		const light = resolveReadableCustomizationPalette(resolveTheme("classic"));
		expect(light.isDark).toBe(false);
		expect(light.utility).toBe("#18181b");
	});
});

describe("profile font surfaces", () => {
	it("pins every profile font to its measured legibility tier", () => {
		expect(
			Object.fromEntries(FONTS.map((font) => [font.value, font.tier])),
		).toEqual({
			sketch: "text",
			amatic: "decorative",
			anton: "text",
			chokokutai: "display",
			dancing: "display",
			indie: "display",
			krub: "display",
			puddles: "decorative",
			medieval: "text",
		});
	});

	it("falls back for display and decorative fonts on compact surfaces", () => {
		expect(resolveFontFor("amatic", "compact")).toBe(PROFILE_UI_FONT_FAMILY);
		expect(resolveFontFor("dancing", "compact")).toBe(PROFILE_UI_FONT_FAMILY);
		expect(resolveFontFor("sketch", "compact")).toBe(
			'"Cabin Sketch", sans-serif',
		);
		expect(resolveFontFor("medieval", "compact")).toBe(
			'"Celtic MD", sans-serif',
		);
	});

	it("preserves every equipped font on display surfaces", () => {
		expect(resolveFontFor("amatic", "display")).toBe('"Amatic SC", cursive');
		expect(resolveFontFor("puddles", "display")).toBe(
			'"Rubik Puddles", cursive',
		);
	});
});
