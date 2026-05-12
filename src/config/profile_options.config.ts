// src/config/profile_options.config.ts

export const TITLES = [
  { id: 'top_sketcher', emoji: '✦', name: 'Top Sketcher', desc: 'Ranked in the global top 100' },
  { id: 'chill_artist', emoji: '🌿', name: 'Chill Artist', desc: 'Over 5 hours of active drawing time' },
  { id: 'on_fire', emoji: '🔥', name: 'On Fire', desc: '7-day drawing streak' },
  { id: 'perfectionist', emoji: '🎯', name: 'Perfectionist', desc: '50 sketches rated 4+ stars' },
  { id: 'art_royalty', emoji: '👑', name: 'Art Royalty', desc: 'Pro Studio supporter' },
  { id: 'speed_demon', emoji: '⚡', name: 'Speed Demon', desc: '10 Blitz drawing sessions' },
  { id: 'night_owl', emoji: '🌙', name: 'Night Owl', desc: 'Late night drawing sessions' }
]

export const FONTS = [
  { value: 'sketch', label: 'Sketch', family: '"Cabin Sketch", sans-serif', preview: 'Artistic' },
  { value: 'amatic', label: 'Amatic', family: '"Amatic SC", cursive', preview: 'Handmade' },
  { value: 'anton', label: 'Anton', family: '"Anton", sans-serif', preview: 'BOLD' },
  { value: 'chokokutai', label: 'Choko', family: '"Chokokutai", cursive', preview: 'チョコ' },
  { value: 'dancing', label: 'Dancing', family: '"Dancing Script", cursive', preview: 'Elegant' },
  { value: 'indie', label: 'Indie Flower', family: '"Indie Flower", cursive', preview: 'Playful' },
  { value: 'krub', label: 'Krub', family: '"Krub", sans-serif', preview: 'Clean' },
  { value: 'puddles', label: 'Puddles', family: '"Rubik Puddles", cursive', preview: 'Bubbly' }
]

export const COLORS = [
  { label: 'Card Canvas', field: 'cardBgColor', default: '#ffffff' },
  { label: 'Name Text', field: 'nameColor', default: '#18181b' },
  { label: 'Bio Text', field: 'descColor', default: '#666666' },
  { label: 'Avatar Ring', field: 'avatarBorderColor', default: '#e5e7eb' },
  { label: 'Card Border', field: 'cardBorderColor', default: '#e5e7eb' },
  { label: 'Signature Ink', field: 'signatureColor', default: '#18181b' }
]

export const EFFECTS = [
  { label: 'None',          value: '' },
  { label: 'Sticker Pop',   value: 'sticker' },
  { label: 'Hyper Neon',    value: 'neon' },
  { label: '3D Echo',       value: 'echo' },
  { label: 'Cyber Glitch',  value: 'glitch' },
  { label: 'Liquid Chroma', value: 'chroma' }
]

export const FONT_EFFECT_MAP: Record<string, string> = {
  sticker: '[text-shadow:-2px_-2px_0_#fff,2px_-2px_0_#fff,-2px_2px_0_#fff,2px_2px_0_#fff,-3px_0_0_#fff,3px_0_0_#fff,0_-3px_0_#fff,0_3px_0_#fff,5px_8px_0_rgba(0,0,0,0.15)] scale-105 transform -rotate-1',
  neon: 'text-white drop-shadow-[0_0_4px_#fff] drop-shadow-[0_0_15px_#a855f7] drop-shadow-[0_0_30px_#a855f7] animate-glow-pulse',
  echo: '[text-shadow:2px_2px_0_#18181b,4px_4px_0_#18181b,6px_6px_0_#18181b,8px_12px_15px_rgba(0,0,0,0.4)] animate-float',
  glitch: 'animate-glitch',
  chroma: 'animate-chroma-flow bg-[linear-gradient(90deg,#ff512f,#dd2476,#4a00e0,#8e2de2,#ff512f)] bg-[length:200%_auto] text-transparent bg-clip-text drop-shadow-[0_4px_10px_rgba(221,36,118,0.4)]'
}

// Visual Logic Maps
export const CARD_BG_MAP: Record<string, string> = {
  frost: 'bg-primary/20 backdrop-blur-2xl',
  blush: 'bg-pink-100/60 backdrop-blur-2xl',
  sage: 'bg-green-100/60 backdrop-blur-2xl',
  dusk: 'bg-purple-100/60 backdrop-blur-2xl'
}

export const CLASSIC_CUSTOMIZATION = {
  titleId: '',
  fontFamily: 'sketch',
  fontEffect: '',
  cardBg: 'frost',
  cardBgColor: '#ffffff',
  nameColor: '#18181b',
  descColor: '#666666',
  avatarBorderColor: '#e5e7eb',
  cardBorderColor: 'rgba(0,0,0,0.12)',
  signatureColor: '#18181b',
  signaturePath: '',
  signatureViewBox: '0 0 300 150',
  unlocked_items: []
}

// Helpers
export const resolveFontFamily = (key: string): string =>
  FONTS.find(f => f.value === key)?.family ?? '"Cabin Sketch", sans-serif'

export const resolveTitle = (id: string | undefined): string =>
  TITLES.find(t => t.id === id)?.name ?? ''

export const formatStatNumber = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n)

export const calculateSignatureStroke = (viewBox: string | undefined): number => {
  const vb = viewBox || '0 0 300 150'
  const vbWidth = parseFloat(vb.split(' ')[2]) || 300
  return (vbWidth / 112) * 2
}

export const hydrateCustomization = (userCustom: any) => {
  return {
    ...CLASSIC_CUSTOMIZATION,
    ...(userCustom || {})
  }
}

export const NAME_CHANGE_COOLDOWN_DAYS = 31