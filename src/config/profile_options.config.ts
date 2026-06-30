// ─── TITLES ──────────────────────────────────────────────────────────────────
export interface Title {
  id: string;
  name: string;
  emoji: string;
  desc: string;
}

export const TITLES: Title[] = [
  { id: 'doodler', name: 'Doodler', emoji: '✏️', desc: 'Sketches with heart' },
  {
    id: 'visionary',
    name: 'Visionary',
    emoji: '👁️',
    desc: 'Sees what others miss'
  },
  { id: 'maestro', name: 'Maestro', emoji: '🎼', desc: 'Master of the craft' },
  {
    id: 'wanderer',
    name: 'Wanderer',
    emoji: '🌙',
    desc: 'Drawn to the unknown'
  },
  {
    id: 'pioneer',
    name: 'Pioneer',
    emoji: '🚀',
    desc: 'First through the door'
  }
]

// ─── FONTS ───────────────────────────────────────────────────────────────────
export interface Font {
  value: string;
  label: string;
  family: string;
  preview: string;
}

export const FONTS: Font[] = [
  {
    value: 'sketch',
    label: 'Sketch',
    family: '"Cabin Sketch", sans-serif',
    preview: 'Artistic'
  },
  {
    value: 'amatic',
    label: 'Amatic',
    family: '"Amatic SC", cursive',
    preview: 'Handmade'
  },
  {
    value: 'anton',
    label: 'Anton',
    family: '"Anton", sans-serif',
    preview: 'BOLD'
  },
  {
    value: 'chokokutai',
    label: 'Choko',
    family: '"Chokokutai", cursive',
    preview: 'チョコ'
  },
  {
    value: 'dancing',
    label: 'Dancing',
    family: '"Dancing Script", cursive',
    preview: 'Elegant'
  },
  {
    value: 'indie',
    label: 'Indie Flower',
    family: '"Indie Flower", cursive',
    preview: 'Playful'
  },
  {
    value: 'krub',
    label: 'Krub',
    family: '"Krub", sans-serif',
    preview: 'Clean'
  },
  {
    value: 'puddles',
    label: 'Puddles',
    family: '"Rubik Puddles", cursive',
    preview: 'Bubbly'
  }
]

export const DEFAULT_FONT_ID = 'sketch'

export const resolveFontFamily = (key?: string): string =>
  FONTS.find((f) => f.value === key)?.family ?? FONTS[0].family

// ─── FONT EFFECTS ────────────────────────────────────────────────────────────
export interface FontEffect {
  value: string;
  label: string;
  desc: string;
}

export const FONT_EFFECTS: FontEffect[] = [
  { value: '', label: 'None', desc: 'Plain text' },
  { value: 'puffy', label: 'Puffy Sticker', desc: 'Thick glossy border & bounce' },
  { value: 'jawbreaker', label: 'Jawbreaker', desc: 'Vibrant stacked 3D colors' },
  { value: 'velvet', label: 'Midnight Velvet', desc: 'Soft glowing luxury drift' }, // New Effect
  { value: 'supernova', label: 'Supernova', desc: 'Hyper-saturated holographic' },
  { value: 'lava', label: 'Lava Lamp', desc: 'Flowing molten gradient' }
]

export const FONT_EFFECT_MAP: Record<string, string> = {
  puffy:
    '[text-shadow:-4px_-4px_0_#fff,4px_-4px_0_#fff,-4px_4px_0_#fff,4px_4px_0_#fff,-6px_0_0_#fff,6px_0_0_#fff,0_-6px_0_#fff,0_6px_0_#fff,0_12px_20px_rgba(0,0,0,0.3)] animate-puffy-bounce',
  jawbreaker:
    '[text-shadow:2px_2px_0_#06b6d4,4px_4px_0_#ec4899,6px_6px_0_#eab308,8px_8px_0_#8b5cf6,12px_16px_25px_rgba(0,0,0,0.35)] animate-jawbreaker-float',
  velvet:
    'text-indigo-950 animate-velvet-glow drop-shadow-[0_0_8px_rgba(79,70,229,0.6)]',
  supernova:
    'animate-supernova-flow bg-[linear-gradient(90deg,#ff0055,#ffaa00,#00ffaa,#00aaff,#ff00ff,#ff0055)] bg-[length:300%_auto] text-transparent bg-clip-text drop-shadow-[0_5px_15px_rgba(0,255,170,0.4)]',
  lava:
    'animate-lava-flow bg-[linear-gradient(180deg,#fef08a,#f59e0b,#ef4444,#f59e0b,#fef08a)] bg-[length:100%_300%] text-transparent bg-clip-text drop-shadow-[0_4px_12px_rgba(239,68,68,0.5)]'
}

export const resolveFontEffectClass = (key?: string): string =>
  (key && FONT_EFFECT_MAP[key]) || ''

// ─── THEMES ──────────────────────────────────────────────────────────────────
export interface Theme {
  id: string;
  name: string;
  desc: string;
  cardBg: string;
  cardBorderColor: string;
  nameColor: string;
  descColor: string;
  titleBg: string;
  accentColor: string;
  swatches: string[];
}

export const THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic',
    desc: 'SketchMate house colors',
    cardBg: '#FAE0C2',
    cardBorderColor: 'rgba(185,70,58,0.2)',
    nameColor: '#3d1a14',
    descColor: 'rgba(61,26,20,0.7)',
    titleBg: '#FFF2E4',
    accentColor: '#B9463A',
    swatches: ['#FAE0C2', '#B9463A', '#FFF2E4']
  },
  {
    id: 'midnight',
    name: 'Midnight',
    desc: 'Deep ink & moonlight',
    cardBg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    cardBorderColor: 'rgba(255,255,255,0.15)',
    nameColor: '#f8fafc',
    descColor: 'rgba(248,250,252,0.7)',
    titleBg: 'rgba(255,255,255,0.08)',
    accentColor: '#a5b4fc',
    swatches: ['#1a1a2e', '#a5b4fc', '#f8fafc']
  },
  {
    id: 'sunset',
    name: 'Sunset',
    desc: 'Warm peach & coral',
    cardBg: 'linear-gradient(135deg, #fed7aa 0%, #fecaca 100%)',
    cardBorderColor: 'rgba(194,65,12,0.2)',
    nameColor: '#7c2d12',
    descColor: 'rgba(124,45,18,0.7)',
    titleBg: 'rgba(255,255,255,0.5)',
    accentColor: '#ea580c',
    swatches: ['#fed7aa', '#ea580c', '#7c2d12']
  },
  {
    id: 'forest',
    name: 'Forest',
    desc: 'Mossy & grounded',
    cardBg: 'linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%)',
    cardBorderColor: 'rgba(20,83,45,0.2)',
    nameColor: '#14532d',
    descColor: 'rgba(20,83,45,0.7)',
    titleBg: 'rgba(255,255,255,0.5)',
    accentColor: '#15803d',
    swatches: ['#dcfce7', '#15803d', '#14532d']
  },
  {
    id: 'sakura',
    name: 'Sakura',
    desc: 'Soft cherry blossom',
    cardBg: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
    cardBorderColor: 'rgba(190,24,93,0.2)',
    nameColor: '#831843',
    descColor: 'rgba(131,24,67,0.7)',
    titleBg: 'rgba(255,255,255,0.6)',
    accentColor: '#db2777',
    swatches: ['#fce7f3', '#db2777', '#831843']
  },
  {
    id: 'ocean',
    name: 'Ocean',
    desc: 'Cool tide & seafoam',
    cardBg: 'linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)',
    cardBorderColor: 'rgba(14,116,144,0.2)',
    nameColor: '#164e63',
    descColor: 'rgba(22,78,99,0.7)',
    titleBg: 'rgba(255,255,255,0.5)',
    accentColor: '#0891b2',
    swatches: ['#cffafe', '#0891b2', '#164e63']
  },
  {
    id: 'noir',
    name: 'Noir',
    desc: 'Mono & moody',
    cardBg: '#0a0a0a',
    cardBorderColor: 'rgba(255,255,255,0.2)',
    nameColor: '#fafafa',
    descColor: 'rgba(250,250,250,0.6)',
    titleBg: 'rgba(255,255,255,0.1)',
    accentColor: '#fafafa',
    swatches: ['#0a0a0a', '#fafafa', '#525252']
  },
  {
    id: 'gold',
    name: 'Gold Leaf',
    desc: 'Luxe & lavish',
    cardBg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    cardBorderColor: 'rgba(146,64,14,0.3)',
    nameColor: '#78350f',
    descColor: 'rgba(120,53,15,0.7)',
    titleBg: 'rgba(255,255,255,0.5)',
    accentColor: '#d97706',
    swatches: ['#fde68a', '#d97706', '#78350f']
  }
]

export const DEFAULT_THEME_ID = 'classic'

export const resolveTheme = (id?: string): Theme =>
  THEMES.find((t) => t.id === id) || THEMES[0]

// ─── AVATAR DECORATIONS ──────────────────────────────────────────────────────
export type DecorationKind =
  | 'none'
  | 'frame'
  | 'halo'
  | 'particles'
  | 'composite'
  | 'topper'
  | 'lottie';

export interface Decoration {
  id: string;
  name: string;
  desc: string;
  kind: DecorationKind;
  frameStroke?: string;
  gradient?: { id: string; stops: { offset: string; color: string }[] };
  haloColor?: string;
  particles?: { emoji: string; count: number; spin?: boolean };
  badge?: { emoji: string; position: 'tl' | 'tr' | 'bl' | 'br' };
  topper?: 'cat-ears';
  lottieId?: 'gamer' | 'wave';
  lottieConfig?: { scale: string; offset: string };
}

export const DECORATIONS: Decoration[] = [
  { id: 'none', name: 'None', desc: 'Just the avatar', kind: 'none' },
  {
    id: 'gamer',
    name: 'Gamer',
    desc: 'Level up!',
    kind: 'lottie',
    lottieId: 'gamer',
    lottieConfig: { scale: '160%', offset: 'translate(-51%, -50%)' }
  },
  {
    id: 'wave',
    name: 'Wave',
    desc: 'Catch the vibe',
    kind: 'lottie',
    lottieId: 'wave',
    lottieConfig: { scale: '120%', offset: 'translate(-50%, -50%)' }
  },
  {
    id: 'neon-halo',
    name: 'Neon Halo',
    desc: 'Cyber glow',
    kind: 'halo',
    haloColor: '#a855f7'
  }
]

export const DEFAULT_DECORATION_ID = 'none'

export const resolveDecoration = (id?: string): Decoration =>
  DECORATIONS.find((d) => d.id === id) || DECORATIONS[0]

export type EffectKind =
  | 'none'
  | 'grain'
  | 'shimmer'
  | 'glass'

export interface ProfileEffectDef {
  id: string;
  name: string;
  desc: string;
  kind: EffectKind;
  emoji?: string;
  density?: number;
  color?: string;
  speed?: 'slow' | 'normal' | 'fast';
}

export const PROFILE_EFFECTS: ProfileEffectDef[] = [
  { id: 'none', name: 'None', desc: 'Clean & quiet', kind: 'none' },

  {
    id: 'grain',
    name: 'Paper Grain',
    desc: 'Subtle texture',
    kind: 'grain'
  },

  {
    id: 'shimmer-gold',
    name: 'Gold Shimmer',
    desc: 'Sweeping gold light',
    kind: 'shimmer',
    color: 'rgba(251,191,36,0.4)',
    speed: 'slow'
  },

  {
    id: 'shimmer-rainbow',
    name: 'Prism',
    desc: 'Rainbow sweep',
    kind: 'shimmer',
    color: 'rainbow',
    speed: 'normal'
  },

  {
    id: 'shattered-glass',
    name: 'Shattered Glass',
    desc: 'Cracked crystal & prism light',
    kind: 'glass',
    speed: 'normal'
  }
]

export const DEFAULT_EFFECT_ID = 'none'

export const resolveEffect = (id?: string): ProfileEffectDef =>
  PROFILE_EFFECTS.find((e) => e.id === id) || PROFILE_EFFECTS[0]

// ─── ATMOSPHERES (FOREGROUND ENVIRONMENTS) ───────────────────────────────────
export type AtmosphereKind = 'none' | 'ocean' | 'cat' | 'autumn' | 'dragon';

export interface AtmosphereDef {
  id: string;
  name: string;
  desc: string;
  kind: AtmosphereKind;
}

export const ATMOSPHERES: AtmosphereDef[] = [
  { id: 'none', name: 'None', desc: 'Quiet space', kind: 'none' },
  {
    id: 'ocean',
    name: 'Aquarium',
    desc: 'Relaxing marine life',
    kind: 'ocean'
  },
  { id: 'cat', name: 'Cozy Cat', desc: 'Meow meow', kind: 'cat' },
  {
    id: 'autumn',
    name: 'Autumn Forest',
    desc: 'Crisp leaves & tiny friends',
    kind: 'autumn'
  },
  {
    id: 'dragon',
    name: 'Dragon\'s Lair',
    desc: 'Fiery peaks & roaming beasts',
    kind: 'dragon'
  }
]

export const DEFAULT_ATMOSPHERE_ID = 'none'

export const resolveAtmosphere = (id?: string): AtmosphereDef =>
  ATMOSPHERES.find((a) => a.id === id) || ATMOSPHERES[0]

// ─── CUSTOMIZATION SHAPE ─────────────────────────────────────────────────────
export interface Customization {
  themeId: string;
  fontId: string;
  fontEffectId: string;
  decorationId: string;
  effectId: string;
  atmosphereId: string;
  titleId: string;
  signaturePath?: string;
  signatureViewBox?: string;
  backgroundSketchPath?: string;
  backgroundSketchViewBox?: string;
}

export const hydrateCustomization = (
  raw?: Partial<Customization> | null
): Customization => ({
  themeId: raw?.themeId || DEFAULT_THEME_ID,
  fontId: raw?.fontId || DEFAULT_FONT_ID,
  fontEffectId: raw?.fontEffectId || '',
  decorationId: raw?.decorationId || DEFAULT_DECORATION_ID,
  effectId: raw?.effectId || DEFAULT_EFFECT_ID,
  atmosphereId: raw?.atmosphereId || DEFAULT_ATMOSPHERE_ID,
  titleId: raw?.titleId || '',
  signaturePath: raw?.signaturePath,
  signatureViewBox: raw?.signatureViewBox,
  backgroundSketchPath: raw?.backgroundSketchPath ?? '',
  backgroundSketchViewBox: raw?.backgroundSketchViewBox ?? ''
})

export const resolveTitle = (id?: string): string => {
  if (!id) return ''
  return TITLES.find((t) => t.id === id)?.name || ''
}

export const NAME_CHANGE_COOLDOWN_DAYS = 31

export const formatStatNumber = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

export const calculateSignatureStroke = (viewBox?: string): number => {
  const vb = viewBox || '0 0 300 150'
  const vbWidth = parseFloat(vb.split(' ')[2]) || 300
  return (vbWidth / 112) * 2
}
