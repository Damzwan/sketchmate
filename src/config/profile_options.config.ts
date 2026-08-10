// ─── TITLES ──────────────────────────────────────────────────────────────────
// Titles are NOT purchasable — they're earned through engagement. Each carries a
// `howTo` line surfaced in the clickable title badge to drive that engagement.
// Ownership lives in inventory under `title.<id>` (see buildItemId). `id: ''` is
// the always-free "no title" option.
export interface Title {
	id: string;
	name: string;
	emoji: string;
	desc: string;
	/** How a user earns this title — shown in the title badge explainer. */
	howTo: string;
	exclusive?: boolean;
}

export const TITLES: Title[] = [
	{
		id: "",
		name: "None",
		emoji: "🚫",
		desc: "No title shown",
		howTo: "Hide your title.",
	},
	{
		id: "early-tester",
		name: "Early Tester",
		emoji: "🌱",
		desc: "Here in the early days",
		howTo: "Joined during the early days.",
	},
	{
		id: "contributor",
		name: "Contributor",
		emoji: "💡",
		desc: "Helped shape the app",
		howTo: "Send feedback by pressing the lightbulb icon (top right).",
	},
	{
		id: "supporter",
		name: "Supporter",
		emoji: "❤️",
		desc: "Backed the project",
		howTo: "Make any purchase.",
	},
	{
		id: "champion",
		name: "Competition Winner",
		emoji: "🏆",
		desc: "Won a weekly art competition",
		howTo: "Win any category in a weekly competition.",
	},
	{
		id: "creator",
		name: "Creator",
		emoji: "🙏️",
		desc: "I created the app haha",
		howTo: "Make the whole app.",
		exclusive: true,
	},
];

const TITLE_BY_ID = new Map(TITLES.map((title) => [title.id, title]));

// ─── FONTS ───────────────────────────────────────────────────────────────────
export interface Font {
	value: string;
	label: string;
	family: string;
	preview: string;
	/** Raster-legibility class. Compact surfaces only honor `text` fonts. */
	tier: "text" | "display" | "decorative";
}

export const FONTS: Font[] = [
	{
		value: "sketch",
		label: "Sketch",
		family: '"Cabin Sketch", sans-serif',
		preview: "Artistic",
		tier: "text",
	},
	{
		value: "amatic",
		label: "Amatic",
		family: '"Amatic SC", cursive',
		preview: "Handmade",
		tier: "decorative",
	},
	{
		value: "anton",
		label: "Anton",
		family: '"Anton", sans-serif',
		preview: "BOLD",
		tier: "text",
	},
	{
		value: "chokokutai",
		label: "Choko",
		family: '"Chokokutai", cursive',
		preview: "チョコ",
		tier: "display",
	},
	{
		value: "dancing",
		label: "Dancing",
		family: '"Dancing Script", cursive',
		preview: "Elegant",
		tier: "display",
	},
	{
		value: "indie",
		label: "Indie Flower",
		family: '"Indie Flower", cursive',
		preview: "Playful",
		tier: "display",
	},
	{
		value: "krub",
		label: "Krub",
		family: '"Krub", sans-serif',
		preview: "Clean",
		tier: "display",
	},
	{
		value: "puddles",
		label: "Puddles",
		family: '"Rubik Puddles", cursive',
		preview: "Bubbly",
		tier: "decorative",
	},
	{
		value: "medieval",
		label: "Medieval",
		family: '"Celtic MD", sans-serif',
		preview: "Medieval",
		tier: "text",
	},
];

const FONT_BY_ID = new Map(FONTS.map((font) => [font.value, font]));

export const DEFAULT_FONT_ID = "sketch";

export const PROFILE_UI_FONT_FAMILY = '"Nunito", sans-serif';

export type FontSurface = "display" | "compact";

/**
 * Resolve an equipped profile font for the space available to it.
 *
 * Large identity surfaces preserve every choice. Compact cards only preserve
 * fonts measured to remain legible at UI sizes; display/decorative faces fall
 * back to the app font instead of becoming faint or unreadable.
 */
export const resolveFontFor = (
	key?: string,
	surface: FontSurface = "display",
): string => {
	const font = key ? (FONT_BY_ID.get(key) ?? FONTS[0]) : FONTS[0];
	return surface === "compact" && font.tier !== "text"
		? PROFILE_UI_FONT_FAMILY
		: font.family;
};

export const resolveFontFamily = (key?: string): string =>
	resolveFontFor(key, "display");

// ─── FONT EFFECTS ────────────────────────────────────────────────────────────
export interface FontEffect {
	value: string;
	label: string;
	desc: string;
}

export const FONT_EFFECTS: FontEffect[] = [
	{ value: "", label: "None", desc: "Plain text" },
	{
		value: "puffy",
		label: "Puffy Sticker",
		desc: "Thick glossy border & bounce",
	},
	{
		value: "jawbreaker",
		label: "Jawbreaker",
		desc: "Vibrant stacked 3D colors",
	},
	{
		value: "velvet",
		label: "Midnight Velvet",
		desc: "Soft glowing luxury drift",
	}, // New Effect
	{
		value: "supernova",
		label: "Supernova",
		desc: "Hyper-saturated holographic",
	},
	{ value: "lava", label: "Lava Lamp", desc: "Flowing molten gradient" },
];

export const FONT_EFFECT_MAP: Record<string, string> = {
	puffy: "font-effect-puffy animate-puffy-bounce",
	jawbreaker:
		"[text-shadow:2px_2px_0_#06b6d4,4px_4px_0_#ec4899,6px_6px_0_#eab308,8px_8px_0_#8b5cf6,12px_16px_25px_rgba(0,0,0,0.35)] animate-jawbreaker-float",
	velvet: "font-effect-velvet animate-velvet-glow",
	supernova:
		"animate-supernova-flow bg-[linear-gradient(90deg,#ff0055,#ffaa00,#00ffaa,#00aaff,#ff00ff,#ff0055)] bg-[length:300%_auto] text-transparent bg-clip-text drop-shadow-[0_5px_15px_rgba(0,255,170,0.4)]",
	lava: "animate-lava-flow bg-[linear-gradient(180deg,#fff7a3,#ffb000,#ff4d00,#b91c1c,#ff6b00,#fff7a3)] bg-[length:100%_350%] text-transparent bg-clip-text drop-shadow-[0_4px_14px_rgba(255,69,0,0.68)]",
};

export const resolveFontEffectClass = (key?: string): string =>
	(key && FONT_EFFECT_MAP[key]) || "";

// ─── THEMES ──────────────────────────────────────────────────────────────────
export interface Theme {
	id: string;
	name: string;
	desc: string;
	/**
	 * Is `cardBg` a DARK surface? Declared, not derived.
	 *
	 * This used to be inferred from `nameColor === nameColorOnLight`, which
	 * happened to be right but described the wrong thing: it answered "is the
	 * name colour already dark enough for a light background", and callers had
	 * to trust that this coincided with the surface being light. Anything that
	 * needs to pick text against a theme's own surface — the chat relationship
	 * strip, texture halos, world-agnostic contrast — should ask the surface
	 * directly.
	 */
	isDark: boolean;
	cardBg: string;
	cardBorderColor: string;
	nameColor: string;
	descColor: string;
	// NEW fields for rendering on standard white/light containers (like chat bubbles)
	nameColorOnLight: string;
	descColorOnLight: string;
	titleBg: string;
	accentColor: string;
	swatches: string[];
}

export const THEMES: Theme[] = [
	{
		id: "classic",
		isDark: false,
		name: "Classic",
		desc: "SketchMate house colors",
		// Built around the tertiary cream (#FFF2E4), not the primary peach.
		// Classic is the app-wide BASELINE card look now, and #FAE0C2 as a large
		// fill went muddy wherever a texture pass (crumpled paper's gray multiply)
		// or a translucent overlay sat on it — mid-strength warm tones gray out
		// under a neutral multiply, while the near-white cream barely shifts. The
		// primary peach moves to titleBg, so the pairing survives inverted.
		cardBg: "#FFF2E4",
		cardBorderColor: "rgba(185,70,58,0.2)",
		nameColor: "#3d1a14",
		descColor: "rgba(61,26,20,0.7)",
		nameColorOnLight: "#3d1a14", // Same as nameColor (it is already dark)
		descColorOnLight: "rgba(61,26,20,0.7)",
		titleBg: "#FAE0C2",
		accentColor: "#B9463A",
		swatches: ["#FFF2E4", "#B9463A", "#FAE0C2"],
	},
	{
		id: "midnight",
		isDark: true,
		name: "Midnight",
		desc: "Deep ink & moonlight",
		cardBg: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
		cardBorderColor: "rgba(255,255,255,0.15)",
		nameColor: "#f8fafc",
		// Light-on-dark loses more perceived contrast per point of alpha than
		// dark-on-light, so the dark themes run hotter than the 0.7 the light
		// themes use.
		descColor: "rgba(248,250,252,0.8)",
		nameColorOnLight: "#1e293b", // Slate 800 for light backgrounds
		descColorOnLight: "rgba(30,41,59,0.7)",
		titleBg: "rgba(255,255,255,0.08)",
		accentColor: "#a5b4fc",
		swatches: ["#1a1a2e", "#a5b4fc", "#f8fafc"],
	},
	{
		id: "sunset",
		isDark: false,
		name: "Sunset",
		desc: "Warm peach & coral",
		cardBg: "linear-gradient(135deg, #fed7aa 0%, #fecaca 100%)",
		cardBorderColor: "rgba(194,65,12,0.2)",
		nameColor: "#7c2d12",
		descColor: "rgba(124,45,18,0.7)",
		nameColorOnLight: "#7c2d12",
		descColorOnLight: "rgba(124,45,18,0.7)",
		titleBg: "rgba(255,255,255,0.5)",
		accentColor: "#ea580c",
		swatches: ["#fed7aa", "#ea580c", "#7c2d12"],
	},
	{
		id: "forest",
		isDark: false,
		name: "Forest",
		desc: "Mossy & grounded",
		cardBg: "linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%)",
		cardBorderColor: "rgba(20,83,45,0.2)",
		nameColor: "#14532d",
		descColor: "rgba(20,83,45,0.7)",
		nameColorOnLight: "#14532d",
		descColorOnLight: "rgba(20,83,45,0.7)",
		titleBg: "rgba(255,255,255,0.5)",
		accentColor: "#15803d",
		swatches: ["#dcfce7", "#15803d", "#14532d"],
	},
	{
		id: "sakura",
		isDark: false,
		name: "Sakura",
		desc: "Soft cherry blossom",
		cardBg: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
		cardBorderColor: "rgba(190,24,93,0.2)",
		nameColor: "#831843",
		descColor: "rgba(131,24,67,0.7)",
		nameColorOnLight: "#831843",
		descColorOnLight: "rgba(131,24,67,0.7)",
		titleBg: "rgba(255,255,255,0.6)",
		accentColor: "#db2777",
		swatches: ["#fce7f3", "#db2777", "#831843"],
	},
	{
		id: "ocean",
		isDark: false,
		name: "Ocean",
		desc: "Cool tide & seafoam",
		cardBg: "linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)",
		cardBorderColor: "rgba(14,116,144,0.2)",
		nameColor: "#164e63",
		descColor: "rgba(22,78,99,0.7)",
		nameColorOnLight: "#164e63",
		descColorOnLight: "rgba(22,78,99,0.7)",
		titleBg: "rgba(255,255,255,0.5)",
		accentColor: "#0891b2",
		swatches: ["#cffafe", "#0891b2", "#164e63"],
	},
	{
		id: "noir",
		isDark: true,
		name: "Noir",
		desc: "Mono & moody",
		cardBg: "#0a0a0a",
		cardBorderColor: "rgba(255,255,255,0.2)",
		nameColor: "#fafafa",
		descColor: "rgba(250,250,250,0.82)",
		nameColorOnLight: "#171717", // Neutral 800/900 for light backgrounds
		descColorOnLight: "rgba(23,23,23,0.75)",
		titleBg: "rgba(255,255,255,0.1)",
		accentColor: "#fafafa",
		swatches: ["#0a0a0a", "#fafafa", "#525252"],
	},
	{
		id: "gold",
		isDark: false,
		name: "Gold Leaf",
		desc: "Luxe & lavish",
		cardBg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
		cardBorderColor: "rgba(146,64,14,0.3)",
		nameColor: "#78350f",
		descColor: "rgba(120,53,15,0.7)",
		nameColorOnLight: "#78350f",
		descColorOnLight: "rgba(120,53,15,0.7)",
		titleBg: "rgba(255,255,255,0.5)",
		accentColor: "#d97706",
		swatches: ["#fde68a", "#d97706", "#78350f"],
	},
];

const THEME_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export const DEFAULT_THEME_ID = "classic";

export const resolveTheme = (id?: string): Theme =>
	(id && THEME_BY_ID.get(id)) || THEMES[0];

/**
 * Whether a theme's card surface is light (dark text on it) or dark.
 *
 * Now a thin read of the declared `isDark` flag. It used to sniff
 * `nameColor === nameColorOnLight`, which was true for every current theme but
 * only by coincidence: a light theme whose author picked a slightly different
 * on-light name colour would have been classified dark, and the failure would
 * have shown up as unreadable text three components away.
 */
export const isLightTheme = (theme: Theme): boolean => !theme.isDark;

// ─── AVATAR DECORATIONS ──────────────────────────────────────────────────────
export type DecorationKind =
	| "none"
	| "frame"
	| "halo"
	| "particles"
	| "composite"
	| "topper"
	| "lottie";

export interface Decoration {
	id: string;
	name: string;
	desc: string;
	kind: DecorationKind;
	frameStroke?: string;
	gradient?: { id: string; stops: { offset: string; color: string }[] };
	haloColor?: string;
	particles?: { emoji: string; count: number; spin?: boolean };
	badge?: { emoji: string; position: "tl" | "tr" | "bl" | "br" };
	topper?: "cat-ears";
	lottieId?: "gamer" | "wave";
	lottieConfig?: { scale: string; offset: string };
}

export const DECORATIONS: Decoration[] = [
	{ id: "none", name: "None", desc: "Just the avatar", kind: "none" },
	{
		id: "gamer",
		name: "Gamer",
		desc: "Level up!",
		kind: "lottie",
		lottieId: "gamer",
		lottieConfig: { scale: "160%", offset: "translate(-51%, -50%)" },
	},
	{
		id: "wave",
		name: "Wave",
		desc: "Catch the vibe",
		kind: "lottie",
		lottieId: "wave",
		lottieConfig: { scale: "120%", offset: "translate(-50%, -50%)" },
	},
	{
		id: "neon-halo",
		name: "Neon Halo",
		desc: "Cyber glow",
		kind: "halo",
		haloColor: "#a855f7",
	},
];

const DECORATION_BY_ID = new Map(
	DECORATIONS.map((decoration) => [decoration.id, decoration]),
);

export const DEFAULT_DECORATION_ID = "none";

export const resolveDecoration = (id?: string): Decoration =>
	(id && DECORATION_BY_ID.get(id)) || DECORATIONS[0];

export type EffectKind = "none" | "grain" | "shimmer" | "glass" | "crumpled";

export interface ProfileEffectDef {
	id: string;
	name: string;
	desc: string;
	kind: EffectKind;
	emoji?: string;
	density?: number;
	color?: string;
	speed?: "slow" | "normal" | "fast";
	/** OG-only: granted, never sold. Hidden from pickers unless already owned. */
	exclusive?: boolean;
}

export const PROFILE_EFFECTS: ProfileEffectDef[] = [
	{ id: "none", name: "None", desc: "Clean & quiet", kind: "none" },

	{
		id: "grain",
		name: "Paper Grain",
		desc: "Subtle texture",
		kind: "grain",
	},

	{
		id: "shimmer-gold",
		name: "Gold Shimmer",
		desc: "Sweeping gold light",
		kind: "shimmer",
		color: "rgba(251,191,36,0.4)",
		speed: "slow",
	},

	{
		id: "shimmer-rainbow",
		name: "Prism",
		desc: "Rainbow sweep",
		kind: "shimmer",
		color: "rainbow",
		speed: "normal",
	},

	{
		id: "shattered-glass",
		name: "Shattered Glass",
		desc: "Cracked crystal & prism light",
		kind: "glass",
		speed: "normal",
	},

	// ── OG-EXCLUSIVE ─────────────────────────────────────────────────────
	// Not in the shop catalog — granted to founding users only (like titles).
	{
		id: "crumpled-paper",
		name: "Crumpled Paper",
		desc: "Well-loved, hand-crumpled note",
		kind: "crumpled",
		speed: "slow",
		exclusive: true,
	},
];

const EFFECT_BY_ID = new Map(
	PROFILE_EFFECTS.map((effect) => [effect.id, effect]),
);

export const DEFAULT_EFFECT_ID = "none";

export const resolveEffect = (id?: string): ProfileEffectDef =>
	(id && EFFECT_BY_ID.get(id)) || PROFILE_EFFECTS[0];

// ─── WORLDS (FOREGROUND ENVIRONMENTS) ───────────────────────────────────
export type WorldKind =
	| "none"
	| "ocean"
	| "cat"
	| "autumn"
	| "dragon"
	| "space"
	| "gratitude";

export interface WorldDef {
	id: string;
	name: string;
	desc: string;
	kind: WorldKind;
	/** OG-only: granted, never sold. Hidden from pickers unless already owned. */
	exclusive?: boolean;
}

export const WORLDS: WorldDef[] = [
	{ id: "none", name: "None", desc: "Quiet space", kind: "none" },
	{
		id: "ocean",
		name: "Aquarium",
		desc: "Relaxing marine life",
		kind: "ocean",
	},
	{ id: "cat", name: "Cozy Cat", desc: "Meow meow", kind: "cat" },
	{
		id: "autumn",
		name: "Autumn Forest",
		desc: "Crisp leaves & tiny friends",
		kind: "autumn",
	},
	{
		id: "dragon",
		name: "Dragon's Lair",
		desc: "Fiery peaks & roaming beasts",
		kind: "dragon",
	},
	{
		id: "space",
		name: "Cosmic Drift",
		desc: "Stars, meteors & a drifting astronaut",
		kind: "space",
	},
	{
		id: "gratitude",
		name: "Gratitude",
		desc: "Only for early SketchMate testers",
		kind: "gratitude",
		exclusive: true,
	},
];

const WORLD_BY_ID = new Map(WORLDS.map((world) => [world.id, world]));

export const DEFAULT_WORLD_ID = "none";

export const resolveWorld = (id?: string): WorldDef =>
	(id && WORLD_BY_ID.get(id)) || WORLDS[0];

// ─── CUSTOMIZATION SHAPE ─────────────────────────────────────────────────────
export interface Customization {
	themeId: string;
	fontId: string;
	fontEffectId: string;
	decorationId: string;
	effectId: string;
	worldId: string;
	titleId: string;
	signaturePath?: string;
	signatureViewBox?: string;
	backgroundSketchPath?: string;
	backgroundSketchViewBox?: string;
}

/** Personal chrome for the owner's ChatWidget. Kept separate from the public
 * profile look: buying an item grants it once, but equipping it here does not
 * change how other people see the user's profile. */
export type ChatCustomization = Pick<
	Customization,
	"themeId" | "fontId" | "fontEffectId"
> & {
	backgroundImageUrl?: string;
	backgroundImageOpacity: number;
};

export const hydrateCustomization = (
	raw?: Partial<Customization> | null,
): Customization => ({
	themeId: raw?.themeId || DEFAULT_THEME_ID,
	fontId: raw?.fontId || DEFAULT_FONT_ID,
	fontEffectId: raw?.fontEffectId || "",
	decorationId: raw?.decorationId || DEFAULT_DECORATION_ID,
	effectId: raw?.effectId || DEFAULT_EFFECT_ID,
	worldId: raw?.worldId || DEFAULT_WORLD_ID,
	titleId: raw?.titleId || "",
	signaturePath: raw?.signaturePath,
	signatureViewBox: raw?.signatureViewBox,
	backgroundSketchPath: raw?.backgroundSketchPath ?? "",
	backgroundSketchViewBox: raw?.backgroundSketchViewBox ?? "",
});

/**
 * Chat sketch strength bounds. Exported because the SLIDER must offer exactly
 * this range: it used to run to 0.50 while hydration capped at 0.35, so the last
 * third of the track moved the label and the stored value but changed nothing on
 * screen, and any re-hydrate snapped the knob back.
 *
 * The ceiling is a readability floor, not a preference — past it the messages
 * stop being legible over the sketch.
 */
export const CHAT_BACKGROUND_OPACITY_MIN = 0.1;
export const CHAT_BACKGROUND_OPACITY_MAX = 0.8;
export const CHAT_BACKGROUND_OPACITY_DEFAULT = 0.2;

export const hydrateChatCustomization = (
	raw?: Partial<ChatCustomization> | null,
): ChatCustomization => ({
	themeId: raw?.themeId || DEFAULT_THEME_ID,
	fontId: raw?.fontId || DEFAULT_FONT_ID,
	fontEffectId: raw?.fontEffectId || "",
	backgroundImageUrl: raw?.backgroundImageUrl || "",
	backgroundImageOpacity: Math.max(
		CHAT_BACKGROUND_OPACITY_MIN,
		Math.min(
			CHAT_BACKGROUND_OPACITY_MAX,
			raw?.backgroundImageOpacity ?? CHAT_BACKGROUND_OPACITY_DEFAULT,
		),
	),
});

export const resolveTitle = (id?: string): string => {
	if (!id) return "";
	return TITLE_BY_ID.get(id)?.name || "";
};

/** Full title definition (name + emoji + howTo) for the clickable badge. */
export const resolveTitleDef = (id?: string): Title | undefined =>
	id ? TITLE_BY_ID.get(id) : undefined;

export interface ReadableCustomizationPalette {
	name: string;
	desc: string;
	isDark: boolean;
	/** Small timestamps/icons that sit at the edge of the full environment. */
	utility: string;
	utilityMuted: string;
	/** Reusable glass treatment for controls placed on customized surfaces. */
	controlForeground: string;
	controlBg: string;
	controlActiveBg: string;
	controlBorder: string;
	/** A small translucent plate for compact surfaces over busy worlds. */
	scrim: string;
	/** Keeps ordinary text readable without replacing premium font effects. */
	textShadow: string;
}

/**
 * One contrast policy for every surface that displays customization.
 *
 * The equipped THEME decides this on its own. It used to be theme-or-world:
 * Cosmic Drift declared itself dark and flipped the whole palette, so a user on
 * a light theme who bought one world got dark chrome everywhere their profile
 * appeared — and every consumer inherited that surprise. Worlds now tint
 * themselves to the surface instead (see ProfileWorld's `dark` prop).
 *
 * Compact surfaces such as chat toasts additionally get a translucent scrim:
 * animated sprites and shimmer can otherwise cross behind glyphs and destroy
 * contrast even when the nominal colors are correct.
 */
export const resolveReadableCustomizationPalette = (
	theme: Theme,
): ReadableCustomizationPalette => {
	const isDark = theme.isDark;

	return {
		name: theme.nameColor,
		desc: theme.descColor,
		isDark,
		utility: isDark ? "#ffffff" : "#18181b",
		utilityMuted: isDark ? "rgba(255,255,255,0.78)" : "rgba(24,24,27,0.62)",
		controlForeground: isDark ? "#ffffff" : "#18181b",
		controlBg: isDark ? "rgba(0,0,0,0.34)" : "rgba(255,255,255,0.42)",
		controlActiveBg: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
		controlBorder: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)",
		scrim: isDark ? "rgba(0,0,0,0.34)" : "rgba(255,255,255,0.52)",
		textShadow: isDark
			? "0 1px 3px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.35)"
			: "0 1px 2px rgba(255,255,255,0.9)",
	};
};

export const NAME_CHANGE_COOLDOWN_DAYS = 31;

export const formatStatNumber = (n: number): string => {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
	if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
	return String(n);
};

export const calculateSignatureStroke = (viewBox?: string): number => {
	const vb = viewBox || "0 0 300 150";
	const vbWidth = parseFloat(vb.split(" ")[2]) || 300;
	return (vbWidth / 112) * 2;
};
