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
		id: "creator",
		name: "Creator",
		emoji: "🙏️",
		desc: "I created the app haha",
		howTo: "Make the whole app.",
		exclusive: true,
	},
];

// ─── FONTS ───────────────────────────────────────────────────────────────────
export interface Font {
	value: string;
	label: string;
	family: string;
	preview: string;
}

export const FONTS: Font[] = [
	{
		value: "sketch",
		label: "Sketch",
		family: '"Cabin Sketch", sans-serif',
		preview: "Artistic",
	},
	{
		value: "amatic",
		label: "Amatic",
		family: '"Amatic SC", cursive',
		preview: "Handmade",
	},
	{
		value: "anton",
		label: "Anton",
		family: '"Anton", sans-serif',
		preview: "BOLD",
	},
	{
		value: "chokokutai",
		label: "Choko",
		family: '"Chokokutai", cursive',
		preview: "チョコ",
	},
	{
		value: "dancing",
		label: "Dancing",
		family: '"Dancing Script", cursive',
		preview: "Elegant",
	},
	{
		value: "indie",
		label: "Indie Flower",
		family: '"Indie Flower", cursive',
		preview: "Playful",
	},
	{
		value: "krub",
		label: "Krub",
		family: '"Krub", sans-serif',
		preview: "Clean",
	},
	{
		value: "puddles",
		label: "Puddles",
		family: '"Rubik Puddles", cursive',
		preview: "Bubbly",
	},
	{
		value: "medieval",
		label: "Medieval",
		family: '"Celtic MD", sans-serif',
		preview: "Medieval",
	},
];

export const DEFAULT_FONT_ID = "sketch";

export const resolveFontFamily = (key?: string): string =>
	FONTS.find((f) => f.value === key)?.family ?? FONTS[0].family;

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
	velvet:
		"text-indigo-950 animate-velvet-glow drop-shadow-[0_0_8px_rgba(79,70,229,0.6)]",
	supernova:
		"animate-supernova-flow bg-[linear-gradient(90deg,#ff0055,#ffaa00,#00ffaa,#00aaff,#ff00ff,#ff0055)] bg-[length:300%_auto] text-transparent bg-clip-text drop-shadow-[0_5px_15px_rgba(0,255,170,0.4)]",
	lava: "animate-lava-flow bg-[linear-gradient(180deg,#fef08a,#f59e0b,#ef4444,#f59e0b,#fef08a)] bg-[length:100%_300%] text-transparent bg-clip-text drop-shadow-[0_4px_12px_rgba(239,68,68,0.5)]",
};

export const resolveFontEffectClass = (key?: string): string =>
	(key && FONT_EFFECT_MAP[key]) || "";

// ─── THEMES ──────────────────────────────────────────────────────────────────
export interface Theme {
	id: string;
	name: string;
	desc: string;
	cardBg: string;
	cardBorderColor: string;
	nameColor: string;
	descColor: string;
	nameColorDark: string;
	descColorDark: string;
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
		name: "Classic",
		desc: "SketchMate house colors",
		cardBg: "#FAE0C2",
		cardBorderColor: "rgba(185,70,58,0.2)",
		nameColor: "#3d1a14",
		descColor: "rgba(61,26,20,0.7)",
		nameColorDark: "#fdf8f5",
		descColorDark: "rgba(253,248,245,0.8)",
		nameColorOnLight: "#3d1a14", // Same as nameColor (it is already dark)
		descColorOnLight: "rgba(61,26,20,0.7)",
		titleBg: "#FFF2E4",
		accentColor: "#B9463A",
		swatches: ["#FAE0C2", "#B9463A", "#FFF2E4"],
	},
	{
		id: "midnight",
		name: "Midnight",
		desc: "Deep ink & moonlight",
		cardBg: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
		cardBorderColor: "rgba(255,255,255,0.15)",
		nameColor: "#f8fafc",
		descColor: "rgba(248,250,252,0.7)",
		nameColorDark: "#f8fafc",
		descColorDark: "rgba(248,250,252,0.7)",
		nameColorOnLight: "#1e293b", // Slate 800 for light backgrounds
		descColorOnLight: "rgba(30,41,59,0.7)",
		titleBg: "rgba(255,255,255,0.08)",
		accentColor: "#a5b4fc",
		swatches: ["#1a1a2e", "#a5b4fc", "#f8fafc"],
	},
	{
		id: "sunset",
		name: "Sunset",
		desc: "Warm peach & coral",
		cardBg: "linear-gradient(135deg, #fed7aa 0%, #fecaca 100%)",
		cardBorderColor: "rgba(194,65,12,0.2)",
		nameColor: "#7c2d12",
		descColor: "rgba(124,45,18,0.7)",
		nameColorDark: "#ffedd5",
		descColorDark: "rgba(255,237,213,0.8)",
		nameColorOnLight: "#7c2d12",
		descColorOnLight: "rgba(124,45,18,0.7)",
		titleBg: "rgba(255,255,255,0.5)",
		accentColor: "#ea580c",
		swatches: ["#fed7aa", "#ea580c", "#7c2d12"],
	},
	{
		id: "forest",
		name: "Forest",
		desc: "Mossy & grounded",
		cardBg: "linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%)",
		cardBorderColor: "rgba(20,83,45,0.2)",
		nameColor: "#14532d",
		descColor: "rgba(20,83,45,0.7)",
		nameColorDark: "#ecfdf5",
		descColorDark: "rgba(236,253,245,0.8)",
		nameColorOnLight: "#14532d",
		descColorOnLight: "rgba(20,83,45,0.7)",
		titleBg: "rgba(255,255,255,0.5)",
		accentColor: "#15803d",
		swatches: ["#dcfce7", "#15803d", "#14532d"],
	},
	{
		id: "sakura",
		name: "Sakura",
		desc: "Soft cherry blossom",
		cardBg: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
		cardBorderColor: "rgba(190,24,93,0.2)",
		nameColor: "#831843",
		descColor: "rgba(131,24,67,0.7)",
		nameColorDark: "#fdf2f8",
		descColorDark: "rgba(253,242,248,0.8)",
		nameColorOnLight: "#831843",
		descColorOnLight: "rgba(131,24,67,0.7)",
		titleBg: "rgba(255,255,255,0.6)",
		accentColor: "#db2777",
		swatches: ["#fce7f3", "#db2777", "#831843"],
	},
	{
		id: "ocean",
		name: "Ocean",
		desc: "Cool tide & seafoam",
		cardBg: "linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)",
		cardBorderColor: "rgba(14,116,144,0.2)",
		nameColor: "#164e63",
		descColor: "rgba(22,78,99,0.7)",
		nameColorDark: "#cffafe",
		descColorDark: "rgba(207,250,254,0.8)",
		nameColorOnLight: "#164e63",
		descColorOnLight: "rgba(22,78,99,0.7)",
		titleBg: "rgba(255,255,255,0.5)",
		accentColor: "#0891b2",
		swatches: ["#cffafe", "#0891b2", "#164e63"],
	},
	{
		id: "noir",
		name: "Noir",
		desc: "Mono & moody",
		cardBg: "#0a0a0a",
		cardBorderColor: "rgba(255,255,255,0.2)",
		nameColor: "#fafafa",
		descColor: "rgba(250,250,250,0.6)",
		nameColorDark: "#fafafa",
		descColorDark: "rgba(250,250,250,0.6)",
		nameColorOnLight: "#171717", // Neutral 800/900 for light backgrounds
		descColorOnLight: "rgba(23,23,23,0.6)",
		titleBg: "rgba(255,255,255,0.1)",
		accentColor: "#fafafa",
		swatches: ["#0a0a0a", "#fafafa", "#525252"],
	},
	{
		id: "gold",
		name: "Gold Leaf",
		desc: "Luxe & lavish",
		cardBg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
		cardBorderColor: "rgba(146,64,14,0.3)",
		nameColor: "#78350f",
		descColor: "rgba(120,53,15,0.7)",
		nameColorDark: "#fef3c7",
		descColorDark: "rgba(254,243,199,0.8)",
		nameColorOnLight: "#78350f",
		descColorOnLight: "rgba(120,53,15,0.7)",
		titleBg: "rgba(255,255,255,0.5)",
		accentColor: "#d97706",
		swatches: ["#fde68a", "#d97706", "#78350f"],
	},
];

export const DEFAULT_THEME_ID = "classic";

export const resolveTheme = (id?: string): Theme =>
	THEMES.find((t) => t.id === id) || THEMES[0];

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

export const DEFAULT_DECORATION_ID = "none";

export const resolveDecoration = (id?: string): Decoration =>
	DECORATIONS.find((d) => d.id === id) || DECORATIONS[0];

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

export const DEFAULT_EFFECT_ID = "none";

export const resolveEffect = (id?: string): ProfileEffectDef =>
	PROFILE_EFFECTS.find((e) => e.id === id) || PROFILE_EFFECTS[0];

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
	isDark?: boolean;
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
		isDark: true,
	},
	{
		id: "gratitude",
		name: "Gratitude",
		desc: "Only for early SketchMate testers",
		kind: "gratitude",
		exclusive: true,
	},
];

export const DEFAULT_WORLD_ID = "none";

export const resolveWorld = (id?: string): WorldDef =>
	WORLDS.find((a) => a.id === id) || WORLDS[0];

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

export const resolveTitle = (id?: string): string => {
	if (!id) return "";
	return TITLES.find((t) => t.id === id)?.name || "";
};

/** Full title definition (name + emoji + howTo) for the clickable badge. */
export const resolveTitleDef = (id?: string): Title | undefined =>
	id ? TITLES.find((t) => t.id === id) : undefined;

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
