import { ColorRGBA } from 'q-floodfill'

export function hexWithOpacity(hex: string, opacityHex: string) {
  return hex.substring(0, 7) + opacityHex
}

export function percentToAlphaHex(opacity: number) {
  return Math.round((opacity * 255) / 100)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
}

export function hexWithoutOpacity(hex: string) {
  return hex.substring(0, 7)
}

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  let r, g, b

  if (s === 0) {
    r = g = b = l // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}
const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
}

export function alphaHexToPercent(hex: string): number {
  // Convert hex to integer (0-255)
  const intValue = hex ? parseInt(hex, 16) : 255

  // Convert to percentage and round it
  return Math.round((intValue / 255) * 100)
}

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return [h * 360, s * 100, l * 100]
}
const hexToRgb = (hex: string): [number, number, number] => {
  const bigint = parseInt(hexWithoutOpacity(hex).substring(1), 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255

  return [r, g, b]
}
export const getColorRecommendations = (hexColor: string): string[][] => {
  const [r, g, b] = hexToRgb(hexColor)
  const [h, s, l] = rgbToHsl(r, g, b)

  const recommendations: string[][] = []

  // First row: Similar colors with lightness variations (adaptive based on lightness)
  const offset = 3 // change according to how much variation you want
  const similarColorsLightness = [
    Math.min(100, l + 3 * offset),
    Math.min(100, l + 2 * offset),
    Math.min(100, l + offset),
    Math.max(0, l - offset),
    Math.max(0, l - 2 * offset),
    Math.max(0, l - 3 * offset)
  ]

  const similarColors = similarColorsLightness.map(lightness => {
    return [h, s, lightness]
  })

  recommendations.push(similarColors.map(([h, s, l]) => rgbToHex(...hslToRgb(h / 360, s / 100, l / 100))))

  // Second row: Contrasting colors
  const contrastingColors = [
    [(h + 180) % 360, s, l], // Complementary color
    [(h + 90) % 360, s, 50], // Perpendicular hue with mid lightness
    [(h + 270) % 360, s, 50], // Another perpendicular hue with mid lightness
    [(h + 120) % 360, s, 50], // Another hue with mid lightness
    [(h + 240) % 360, s, 50], // Another hue with mid lightness
    [(h + 60) % 360, s, 50] // Another hue with mid lightness
  ]

  recommendations.push(contrastingColors.map(([h, s, l]) => rgbToHex(...hslToRgb(h / 360, s / 100, l / 100))))

  return recommendations
}

export function isColorTooLight(hex: string) {
  // Convert hex to RGB values
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  // Calculate the luminance
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

  // Set a threshold value (for instance, 0.7)
  return luminance > 0.9
}

export function hex2RGBA(hex: string): ColorRGBA {
  let parsedHex = hex.startsWith('#') ? hex.slice(1) : hex

  // Convert 4-digit hex (with alpha) to 8-digits and 3-digit hex to 6-digits.
  if (parsedHex.length === 4) {
    parsedHex =
      parsedHex[0] +
      parsedHex[0] +
      parsedHex[1] +
      parsedHex[1] +
      parsedHex[2] +
      parsedHex[2] +
      parsedHex[3] +
      parsedHex[3]
  } else if (parsedHex.length === 3) {
    parsedHex = parsedHex[0] + parsedHex[0] + parsedHex[1] + parsedHex[1] + parsedHex[2] + parsedHex[2]
  }

  // Check for valid lengths (either 6 without alpha or 8 with alpha)
  if (parsedHex.length !== 6 && parsedHex.length !== 8) {
    throw new Error(`Invalid HEX color ${parsedHex}.`)
  }

  const r = parseInt(parsedHex.slice(0, 2), 16)
  const g = parseInt(parsedHex.slice(2, 4), 16)
  const b = parseInt(parsedHex.slice(4, 6), 16)
  const a = parsedHex.length === 8 ? parseInt(parsedHex.slice(6, 8), 16) : 255

  return {
    r,
    g,
    b,
    a
  }
}

export function opacityFromOpacityHex(color: string) {
  return parseInt(color.slice(-2), 16) / 255
}

export function hexWithTransparencyToNormal(hex: string) {
  if (hex.length === 9 && hex.startsWith('#')) {
    return hex.substring(0, 7)
  }
  return hex // Return the original if it's not an 8-character hex color
}