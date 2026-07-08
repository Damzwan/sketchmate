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
	| "world"
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
	/** Optional emoji used by hero/bundle cards for a touch of personality. */
	emoji?: string;
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
		rcProductId: "sm_theme_sunset_v2",
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
		id: "decoration.neon-halo",
		kind: "single",
		rcProductId: "sm_deco_neon_halo",
		grants: ["decoration.neon-halo"],
		category: "decoration",
		name: "Neon Halo",
		desc: "Cyber glow",
		refId: "neon-halo",
	},
];

// ─── PROFILE EFFECTS ─────────────────────────────────────────────────────────
// `none` stays free. Rest are paid.
const EFFECT_SKUS: ShopSku[] = [
	{
		id: "effect.grain",
		kind: "single",
		rcProductId: "sm_effect_grain",
		grants: ["effect.grain"],
		category: "effect",
		name: "Paper Grain",
		desc: "Subtle texture",
		refId: "grain",
	},
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
		id: "effect.shattered-glass",
		kind: "single",
		rcProductId: "sm_effect_shattered_glass",
		grants: ["effect.shattered-glass"],
		category: "effect",
		name: "Shattered Glass",
		desc: "Cracked crystal & prism light",
		refId: "shattered-glass",
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
		id: "font_effect.puffy",
		kind: "single",
		rcProductId: "sm_fxtext_puffy",
		grants: ["font_effect.puffy"],
		category: "font_effect",
		name: "Puffy Sticker",
		desc: "Thick glossy border & bounce",
		refId: "puffy",
	},
	{
		id: "font_effect.jawbreaker",
		kind: "single",
		rcProductId: "sm_fxtext_jawbreaker",
		grants: ["font_effect.jawbreaker"],
		category: "font_effect",
		name: "Jawbreaker",
		desc: "Vibrant stacked 3D colors",
		refId: "jawbreaker",
	},
	{
		id: "font_effect.velvet",
		kind: "single",
		rcProductId: "sm_fxtext_velvet",
		grants: ["font_effect.velvet"],
		category: "font_effect",
		name: "Midnight Velvet",
		desc: "Soft glowing luxury drift",
		refId: "velvet",
	},
	{
		id: "font_effect.supernova",
		kind: "single",
		rcProductId: "sm_fxtext_supernova",
		grants: ["font_effect.supernova"],
		category: "font_effect",
		name: "Supernova",
		desc: "Hyper-saturated holographic",
		refId: "supernova",
	},
	{
		id: "font_effect.lava",
		kind: "single",
		rcProductId: "sm_fxtext_lava",
		grants: ["font_effect.lava"],
		category: "font_effect",
		name: "Lava Lamp",
		desc: "Flowing molten gradient",
		refId: "lava",
	},
];

// ─── WORLDS ─────────────────────────────────────────────────────────────
// `none` is free. Living, animated environments for the profile card.
const WORLD_SKUS: ShopSku[] = [
	{
		id: "world.ocean",
		kind: "single",
		rcProductId: "sm_world_ocean",
		grants: ["world.ocean"],
		category: "world",
		name: "Aquarium",
		desc: "Fish, turtles & jellyfish drift by",
		refId: "ocean",
		emoji: "🐠",
	},
	{
		id: "world.cat",
		kind: "single",
		rcProductId: "sm_world_cat",
		grants: ["world.cat"],
		category: "world",
		name: "Cozy Cat",
		desc: "A napping friend & swaying plants",
		refId: "cat",
		emoji: "🐱",
	},
	{
		id: "world.autumn",
		kind: "single",
		rcProductId: "sm_world_autumn",
		grants: ["world.autumn"],
		category: "world",
		name: "Autumn Forest",
		desc: "Falling leaves & wandering mushrooms",
		refId: "autumn",
		emoji: "🍂",
	},
	{
		id: "world.dragon",
		kind: "single",
		rcProductId: "sm_world_dragon",
		grants: ["world.dragon"],
		category: "world",
		name: "Dragon's Lair",
		desc: "Fiery peaks & a roaming dragon",
		refId: "dragon",
		emoji: "🐉",
	},
	{
		id: "world.space",
		kind: "single",
		rcProductId: "sm_world_space",
		grants: ["world.space"],
		category: "world",
		name: "Cosmic Drift",
		desc: "Meteor showers, a drifting astronaut & launching rockets",
		refId: "space",
		emoji: "🚀",
	},
];

// ─── TITLES ──────────────────────────────────────────────────────────────────
// Titles are earned through engagement, not purchased — granted by the titles
// router (titles.router.ts) and the RC webhook. They live in inventory under
// `title.<id>` but are NOT part of the shop catalog.

// ─── BUNDLES ─────────────────────────────────────────────────────────────────
// Curated boxes — one item per category, so each bundle is a head-to-toe look
// rather than a pile of near-duplicates. Cheaper than buying the pieces.
const BUNDLE_SKUS: ShopSku[] = [
	{
		id: "pack.cyber",
		kind: "bundle",
		rcProductId: "sm_pack_cyber",
		grants: [
			"theme.midnight",
			"decoration.neon-halo",
			"effect.shimmer-rainbow",
			"font_effect.supernova",
			"brush.neon",
		],
		category: "pack",
		name: "Neon Nights",
		desc: "A full neon makeover, glow head to toe.",
		emoji: "🌃",
		featured: true,
	},
	{
		id: "pack.gold",
		kind: "bundle",
		rcProductId: "sm_pack_gold",
		grants: [
			"theme.gold",
			"effect.shimmer-gold",
			"font_effect.velvet",
			"world.autumn",
			"brush.calligraphy",
		],
		category: "pack",
		name: "Golden Hour",
		desc: "Warm, gilded & quietly luxurious.",
		emoji: "✨",
		featured: true,
	},
	{
		id: "pack.wild",
		kind: "bundle",
		rcProductId: "sm_pack_wild",
		grants: ["theme.ocean", "decoration.wave", "world.ocean", "font.indie"],
		category: "pack",
		name: "Into the Wild",
		desc: "Ocean blues with a living aquarium.",
		emoji: "🌊",
		featured: true,
	},
	{
		id: "pack.dragon",
		kind: "bundle",
		rcProductId: "sm_pack_dragon",
		grants: [
			"theme.noir",
			"effect.shattered-glass",
			"world.dragon",
			"font_effect.lava",
		],
		category: "pack",
		name: "Dragon's Hoard",
		desc: "Dark, cracked glass & a roaming dragon.",
		emoji: "🐉",
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
	...WORLD_SKUS,
	...FONT_SKUS,
	...FONT_EFFECT_SKUS,
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
	"font.sketch",
	"font_effect.",
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

/** Emoji per category — used for chips, nav and grant badges. */
export const CATEGORY_EMOJI: Record<ItemCategory, string> = {
	theme: "🎨",
	brush: "🖌️",
	decoration: "✨",
	effect: "💫",
	world: "🌍",
	font: "🔤",
	font_effect: "🅰️",
	title: "🏷️",
	pack: "📦",
};

/** Human-friendly label + icon for an item ID, for showing exactly what a
 *  bundle contains. Falls back to a title-cased refId when no SKU defines it. */
export const describeGrant = (
	itemId: string,
): { label: string; category: ItemCategory; emoji: string } => {
	const [cat, ...rest] = itemId.split(".");
	const category = cat as ItemCategory;
	const refId = rest.join(".");
	const known = CATALOG_BY_ID[itemId];
	const label =
		known?.name ||
		refId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	return { label, category, emoji: CATEGORY_EMOJI[category] ?? "🎁" };
};

/** Hero items showcased at the top of the shop. Order = display order. */
export const HIGHLIGHT_IDS: string[] = [
	"world.space",
	"effect.shattered-glass",
	"world.dragon",
];

/** Pro entitlement identifier in RevenueCat. Pro unlocks app features (quota,
 *  etc.) plus the item categories in PRO_UNLOCKED_CATEGORIES. */
export const PRO_ENTITLEMENT = "SketchMate Pro";

/** Lifetime entitlement — grants access to literally everything (every
 *  category, present & future). Backed by the `sm_pro_lifetime` product. */
export const LIFETIME_ENTITLEMENT = "Lifetime";
export const LIFETIME_RC_PRODUCT = "sm_pro_lifetime";

/** Item categories a normal Pro subscription unlocks. Everything NOT listed
 *  stays purchase-gated (buy the single/bundle, or go Lifetime for all).
 *  Pro currently unlocks brushes only. Titles are never sub-unlocked — they're
 *  earned, handled separately. */
export const PRO_UNLOCKED_CATEGORIES: ItemCategory[] = ["brush"];
