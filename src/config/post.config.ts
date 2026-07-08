import love from '@/assets/stickers/love.webp'
import cry from '@/assets/stickers/cry.webp'
import fire from '@/assets/stickers/fire.webp'
import sleep from '@/assets/stickers/sleep.webp'
import crazy from '@/assets/stickers/crazy.webp'

export const reactionImages: Record<any, any> = {
  love: love,
  cry: cry,
  fire: fire,
  sleep: sleep,
  crazy: crazy
}

/** Human-readable labels per reaction, for breakdowns and a11y. */
export const reactionLabels: Record<string, string> = {
  love: 'Love',
  fire: 'Fire',
  cry: 'Tears',
  sleep: 'Sleepy',
  crazy: 'Crazy'
}
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNative } from '@/helper/general.helper'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const impact = (style: ImpactStyle) => Haptics.impact({ style })

/**
 * How long each reaction's on-image animation runs. The overlay is kept
 * mounted for exactly this long so nothing gets clipped mid-flight.
 */
export const reactionAnimDuration: Record<string, number> = {
  love: 1450,
  fire: 1500,
  cry: 1550,
  crazy: 1900,
  sleep: 1700
}

/**
 * Hand-tuned haptic choreography per emotion. Each pattern is a short
 * sequence that physically mirrors the feeling of the reaction — a
 * heartbeat for love, a crackling staccato for fire, and so on.
 */
export const playHapticPattern = async (reaction: string) => {
  if (!isNative()) return
  try {
    switch (reaction) {
      case 'love':
        // Two "lub-dub" heartbeats.
        await impact(ImpactStyle.Medium)
        await wait(110)
        await impact(ImpactStyle.Light)
        await wait(260)
        await impact(ImpactStyle.Medium)
        await wait(110)
        await impact(ImpactStyle.Light)
        break

      case 'fire':
        // Accelerating crackle that builds to a peak.
        for (let i = 0; i < 5; i++) {
          await impact(i < 3 ? ImpactStyle.Light : ImpactStyle.Heavy)
          await wait(90 - i * 12)
        }
        break

      case 'crazy':
        // Erratic, off-kilter jolts.
        await impact(ImpactStyle.Heavy)
        await wait(60)
        await impact(ImpactStyle.Light)
        await wait(40)
        await impact(ImpactStyle.Medium)
        await Haptics.notification({ type: NotificationType.Warning })
        break

      case 'cry':
        // One sob, then two slow falling tears.
        await impact(ImpactStyle.Medium)
        await wait(300)
        await impact(ImpactStyle.Light)
        await wait(350)
        await impact(ImpactStyle.Light)
        break

      case 'sleep':
        // Two long, faint breaths.
        await impact(ImpactStyle.Light)
        await wait(600)
        await impact(ImpactStyle.Light)
        break
    }
  } catch (e) {
    // Graceful fallback for non-native environments
  }
}

/** Light confirmation tick when a long-press arms the reaction picker. */
export const playSelectionTick = async () => {
  if (!isNative()) return
  try {
    await impact(ImpactStyle.Medium)
  } catch (e) {
    // no-op off-device
  }
}