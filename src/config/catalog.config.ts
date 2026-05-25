// ─── SHOP CATALOG ────────────────────────────────────────────────────────────
// Single source of truth for everything that can be purchased or granted.
// Item IDs use dotted namespaces (e.g. "theme.midnight") so the picker modals
// can ask `isOwned("theme.midnight")` without caring whether it came from a
// single IAP, a bundle, or Pro.

export type SkuKind = "single" | "bundle";
export type ItemCategory =
	| "brush"
	| "theme"
	| "decoration"
	| "effect"
	| "font"
	| "font_effect"
	| "title"
	| "pack";

export interface ShopSku {
	id: string;
	kind: SkuKind;
	rcProductId: string;
	grants: string[];
	category: ItemCategory;
	name: string;
	desc: string;
	refId?: string;
	featured?: boolean;
}

// ─── BRUSHES ─────────────────────────────────────────────────────────────────
const BRUSH_SKUS: ShopSku[] = [
	{
		id: "brush.neon",
		kind: "single",
		rcProductId: "sm_brush_neon",
		grants: ["brush.neon"],
		category: "brush",
		name: "Neon Pen",
		desc: "Glows in the dark",
		refId: "neon",
	},
	{
		id: "brush.calligraphy",
		kind: "single",
		rcProductId: "sm_brush_calligraphy",
		grants: ["brush.calligraphy"],
		category: "brush",
		name: "Calligraphy",
		desc: "Elegant strokes",
		refId: "calligraphy",
	},
];

// ─── THEMES ──────────────────────────────────────────────────────────────────
// `classic` is free — not in the catalog. Everything else is paid.
const THEME_SKUS: ShopSku[] = [
	{
		id: "theme.midnight",
		kind: "single",
		rcProductId: "sm_theme_midnight",
		grants: ["theme.midnight"],
		category: "theme",
		name: "Midnight",
		desc: "Deep ink & moonlight",
		refId: "midnight",
	},
	{
		id: "theme.sunset",
		kind: "single",
		rcProductId: "sm_theme_sunset",
		grants: ["theme.sunset"],
		category: "theme",
		name: "Sunset",
		desc: "Warm peach & coral",
		refId: "sunset",
	},
	{
		id: "theme.forest",
		kind: "single",
		rcProductId: "sm_theme_forest",
		grants: ["theme.forest"],
		category: "theme",
		name: "Forest",
		desc: "Mossy & grounded",
		refId: "forest",
	},
	{
		id: "theme.sakura",
		kind: "single",
		rcProductId: "sm_theme_sakura",
		grants: ["theme.sakura"],
		category: "theme",
		name: "Sakura",
		desc: "Soft cherry blossom",
		refId: "sakura",
	},
	{
		id: "theme.ocean",
		kind: "single",
		rcProductId: "sm_theme_ocean",
		grants: ["theme.ocean"],
		category: "theme",
		name: "Ocean",
		desc: "Cool tide & seafoam",
		refId: "ocean",
	},
	{
		id: "theme.noir",
		kind: "single",
		rcProductId: "sm_theme_noir",
		grants: ["theme.noir"],
		category: "theme",
		name: "Noir",
		desc: "Mono & moody",
		refId: "noir",
	},
	{
		id: "theme.gold",
		kind: "single",
		rcProductId: "sm_theme_gold",
		grants: ["theme.gold"],
		category: "theme",
		name: "Gold Leaf",
		desc: "Luxe & lavish",
		refId: "gold",
	},
];

// ─── DECORATIONS ─────────────────────────────────────────────────────────────
// `none` is free. The rest are paid.
const DECORATION_SKUS: ShopSku[] = [
	{
		id: "decoration.gamer",
		kind: "single",
		rcProductId: "sm_deco_gamer",
		grants: ["decoration.gamer"],
		category: "decoration",
		name: "Gamer",
		desc: "Level up!",
		refId: "gamer",
	},
	{
		id: "decoration.wave",
		kind: "single",
		rcProductId: "sm_deco_wave",
		grants: ["decoration.wave"],
		category: "decoration",
		name: "Wave",
		desc: "Catch the vibe",
		refId: "wave",
	},
	{
		id: "decoration.cat-ears",
		kind: "single",
		rcProductId: "sm_deco_cat_ears",
		grants: ["decoration.cat-ears"],
		category: "decoration",
		name: "Cat Ears",
		desc: "Purrfect look",
		refId: "cat-ears",
	},
	{
		id: "decoration.neon-halo",
		kind: "single",
		rcProductId: "sm_deco_neon_halo",
		grants: ["decoration.neon-halo"],
		category: "decoration",
		name: "Neon Halo",
		desc: "Cyber glow",
		refId: "neon-halo",
	},
	{
		id: "decoration.sparkle-storm",
		kind: "single",
		rcProductId: "sm_deco_sparkle_storm",
		grants: ["decoration.sparkle-storm"],
		category: "decoration",
		name: "Sparkle Storm",
		desc: "Twinkling stars orbit",
		refId: "sparkle-storm",
	},
	{
		id: "decoration.cherry-petals",
		kind: "single",
		rcProductId: "sm_deco_cherry_petals",
		grants: ["decoration.cherry-petals"],
		category: "decoration",
		name: "Cherry Petals",
		desc: "Falling sakura",
		refId: "cherry-petals",
	},
	{
		id: "decoration.royal",
		kind: "single",
		rcProductId: "sm_deco_royal",
		grants: ["decoration.royal"],
		category: "decoration",
		name: "Royal Crown",
		desc: "A crown for your head",
		refId: "royal",
	},
	{
		id: "decoration.storm",
		kind: "single",
		rcProductId: "sm_deco_storm",
		grants: ["decoration.storm"],
		category: "decoration",
		name: "Stormcaller",
		desc: "Lightning halo",
		refId: "storm",
	},
	{
		id: "decoration.bloom",
		kind: "single",
		rcProductId: "sm_deco_bloom",
		grants: ["decoration.bloom"],
		category: "decoration",
		name: "Bloom",
		desc: "Garden of flowers",
		refId: "bloom",
	},
];

// ─── PROFILE EFFECTS ─────────────────────────────────────────────────────────
// `none` and `grain` stay free as a teaser. Rest are paid.
const EFFECT_SKUS: ShopSku[] = [
	{
		id: "effect.shimmer-gold",
		kind: "single",
		rcProductId: "sm_effect_shimmer_gold",
		grants: ["effect.shimmer-gold"],
		category: "effect",
		name: "Gold Shimmer",
		desc: "Sweeping gold light",
		refId: "shimmer-gold",
	},
	{
		id: "effect.shimmer-rainbow",
		kind: "single",
		rcProductId: "sm_effect_shimmer_rainbow",
		grants: ["effect.shimmer-rainbow"],
		category: "effect",
		name: "Prism",
		desc: "Rainbow sweep",
		refId: "shimmer-rainbow",
	},
	{
		id: "effect.sparkles",
		kind: "single",
		rcProductId: "sm_effect_sparkles",
		grants: ["effect.sparkles"],
		category: "effect",
		name: "Sparkles",
		desc: "Floating glints",
		refId: "sparkles",
	},
	{
		id: "effect.falling-petals",
		kind: "single",
		rcProductId: "sm_effect_falling_petals",
		grants: ["effect.falling-petals"],
		category: "effect",
		name: "Falling Petals",
		desc: "Sakura snowfall",
		refId: "falling-petals",
	},
	{
		id: "effect.falling-leaves",
		kind: "single",
		rcProductId: "sm_effect_falling_leaves",
		grants: ["effect.falling-leaves"],
		category: "effect",
		name: "Autumn Drift",
		desc: "Leaves on the wind",
		refId: "falling-leaves",
	},
	{
		id: "effect.falling-snow",
		kind: "single",
		rcProductId: "sm_effect_falling_snow",
		grants: ["effect.falling-snow"],
		category: "effect",
		name: "Snowfall",
		desc: "Winter mood",
		refId: "falling-snow",
	},
	{
		id: "effect.fire",
		kind: "single",
		rcProductId: "sm_effect_fire",
		grants: ["effect.fire"],
		category: "effect",
		name: "Embers",
		desc: "Rising flames",
		refId: "fire",
	},
	{
		id: "effect.bubbles",
		kind: "single",
		rcProductId: "sm_effect_bubbles",
		grants: ["effect.bubbles"],
		category: "effect",
		name: "Bubbles",
		desc: "Floating up",
		refId: "bubbles",
	},
];

// ─── FONTS ───────────────────────────────────────────────────────────────────
// `sketch` (default) is free. The rest are paid.
const FONT_SKUS: ShopSku[] = [
	{
		id: "font.amatic",
		kind: "single",
		rcProductId: "sm_font_amatic",
		grants: ["font.amatic"],
		category: "font",
		name: "Amatic",
		desc: "Handmade",
		refId: "amatic",
	},
	{
		id: "font.anton",
		kind: "single",
		rcProductId: "sm_font_anton",
		grants: ["font.anton"],
		category: "font",
		name: "Anton",
		desc: "Bold & loud",
		refId: "anton",
	},
	{
		id: "font.chokokutai",
		kind: "single",
		rcProductId: "sm_font_chokokutai",
		grants: ["font.chokokutai"],
		category: "font",
		name: "Choko",
		desc: "Japanese display",
		refId: "chokokutai",
	},
	{
		id: "font.dancing",
		kind: "single",
		rcProductId: "sm_font_dancing",
		grants: ["font.dancing"],
		category: "font",
		name: "Dancing",
		desc: "Elegant script",
		refId: "dancing",
	},
	{
		id: "font.indie",
		kind: "single",
		rcProductId: "sm_font_indie",
		grants: ["font.indie"],
		category: "font",
		name: "Indie Flower",
		desc: "Playful",
		refId: "indie",
	},
	{
		id: "font.krub",
		kind: "single",
		rcProductId: "sm_font_krub",
		grants: ["font.krub"],
		category: "font",
		name: "Krub",
		desc: "Clean modern",
		refId: "krub",
	},
	{
		id: "font.puddles",
		kind: "single",
		rcProductId: "sm_font_puddles",
		grants: ["font.puddles"],
		category: "font",
		name: "Puddles",
		desc: "Bubbly fun",
		refId: "puddles",
	},
];

// ─── FONT EFFECTS ────────────────────────────────────────────────────────────
// "" (None) is free. The rest are paid.
const FONT_EFFECT_SKUS: ShopSku[] = [
	{
		id: "font_effect.sticker",
		kind: "single",
		rcProductId: "sm_fxtext_sticker",
		grants: ["font_effect.sticker"],
		category: "font_effect",
		name: "Sticker Pop",
		desc: "White outline punch",
		refId: "sticker",
	},
	{
		id: "font_effect.neon",
		kind: "single",
		rcProductId: "sm_fxtext_neon",
		grants: ["font_effect.neon"],
		category: "font_effect",
		name: "Hyper Neon",
		desc: "Purple glow pulse",
		refId: "neon",
	},
	{
		id: "font_effect.echo",
		kind: "single",
		rcProductId: "sm_fxtext_echo",
		grants: ["font_effect.echo"],
		category: "font_effect",
		name: "3D Echo",
		desc: "Stacked shadow",
		refId: "echo",
	},
	{
		id: "font_effect.glitch",
		kind: "single",
		rcProductId: "sm_fxtext_glitch",
		grants: ["font_effect.glitch"],
		category: "font_effect",
		name: "Cyber Glitch",
		desc: "Digital tear",
		refId: "glitch",
	},
	{
		id: "font_effect.chroma",
		kind: "single",
		rcProductId: "sm_fxtext_chroma",
		grants: ["font_effect.chroma"],
		category: "font_effect",
		name: "Liquid Chroma",
		desc: "Flowing rainbow",
		refId: "chroma",
	},
];

// ─── TITLES ──────────────────────────────────────────────────────────────────
const TITLE_SKUS: ShopSku[] = [
	{
		id: "title.doodler",
		kind: "single",
		rcProductId: "sm_title_doodler",
		grants: ["title.doodler"],
		category: "title",
		name: "Doodler",
		desc: "Sketches with heart",
		refId: "doodler",
	},
	{
		id: "title.visionary",
		kind: "single",
		rcProductId: "sm_title_visionary",
		grants: ["title.visionary"],
		category: "title",
		name: "Visionary",
		desc: "Sees what others miss",
		refId: "visionary",
	},
	{
		id: "title.maestro",
		kind: "single",
		rcProductId: "sm_title_maestro",
		grants: ["title.maestro"],
		category: "title",
		name: "Maestro",
		desc: "Master of the craft",
		refId: "maestro",
	},
	{
		id: "title.wanderer",
		kind: "single",
		rcProductId: "sm_title_wanderer",
		grants: ["title.wanderer"],
		category: "title",
		name: "Wanderer",
		desc: "Drawn to the unknown",
		refId: "wanderer",
	},
	{
		id: "title.pioneer",
		kind: "single",
		rcProductId: "sm_title_pioneer",
		grants: ["title.pioneer"],
		category: "title",
		name: "Pioneer",
		desc: "First through the door",
		refId: "pioneer",
	},
];

// ─── BUNDLES ─────────────────────────────────────────────────────────────────
// Bundles are featured prominently. Adjust grants to your roadmap.
const BUNDLE_SKUS: ShopSku[] = [
	{
		id: "pack.sakura",
		kind: "bundle",
		rcProductId: "sm_pack_sakura",
		grants: [
			"theme.sakura",
			"effect.falling-petals",
			"decoration.cherry-petals",
		],
		category: "pack",
		name: "Sakura Pack",
		desc: "Theme + petals + cherry halo",
		featured: true,
	},
	{
		id: "pack.cyber",
		kind: "bundle",
		rcProductId: "sm_pack_cyber",
		grants: [
			"theme.midnight",
			"decoration.neon-halo",
			"brush.neon",
			"font_effect.neon",
		],
		category: "pack",
		name: "Cyber Pack",
		desc: "Midnight + neon halo + neon brush",
		featured: true,
	},
];

// ─── ASSEMBLED CATALOG ───────────────────────────────────────────────────────
export const CATALOG: ShopSku[] = [
	...BUNDLE_SKUS,
	...BRUSH_SKUS,
	...THEME_SKUS,
	...DECORATION_SKUS,
	...EFFECT_SKUS,
	...FONT_SKUS,
	...FONT_EFFECT_SKUS,
	...TITLE_SKUS,
];

// ─── INDEXES ─────────────────────────────────────────────────────────────────
export const CATALOG_BY_ID: Record<string, ShopSku> = Object.fromEntries(
	CATALOG.map((s) => [s.id, s]),
);

export const CATALOG_BY_RC_PRODUCT: Record<string, ShopSku> =
	Object.fromEntries(CATALOG.map((s) => [s.rcProductId, s]));

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Free items that ship with the app — never require ownership. */
export const FREE_ITEMS = new Set<string>([
	"theme.classic",
	"decoration.none",
	"effect.none",
	"effect.grain",
	"font.sketch",
	"font_effect.", // empty string font effect = "None"
	// Default brushes
	"brush.pencil",
	"brush.watercolor",
	"brush.spray",
	"brush.circle",
	"brush.pixel",
	"brush.crayon",
	"brush.charcoal",
]);

/** Build the canonical item ID for a given category + refId combo. */
export const buildItemId = (category: ItemCategory, refId: string): string =>
	`${category}.${refId}`;

/** Expand a SKU's grants. Bundles already have multi-item grants; singles
 *  return their lone item. */
export const grantsForSku = (skuId: string): string[] => {
	const sku = CATALOG_BY_ID[skuId];
	return sku ? sku.grants : [];
};

/** Expand grants from a RevenueCat product identifier. Used by the webhook. */
export const grantsForRcProduct = (rcProductId: string): string[] => {
	const sku = CATALOG_BY_RC_PRODUCT[rcProductId];
	return sku ? sku.grants : [];
};

/** Pro entitlement identifier in RevenueCat. Pro grants access to everything
 *  dynamically — items are not added to `inventory`. */
export const PRO_ENTITLEMENT = "SketchMate Pro";
