import love from '@/assets/stickers/love.png'
import cry from '@/assets/stickers/cry.png'
import fire from '@/assets/stickers/fire.png'
import sleep from '@/assets/stickers/sleep.png'
import crazy from '@/assets/stickers/crazy.png'

export const reactionImages: Record<any, any> = {
  love: love,
  cry: cry,
  fire: fire,
  sleep: sleep,
  crazy: crazy
}
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNative } from '@/helper/general.helper'

export const playHapticPattern = async (reaction: string) => {
  if (!isNative()) return
  try {
    switch (reaction) {
      case 'love':
        // A soft heartbeat feel
        await Haptics.impact({ style: ImpactStyle.Medium })
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }), 150)
        break

      case 'fire':
        // Rapid, intense staccato
        for (let i = 0; i < 3; i++) {
          await Haptics.impact({ style: ImpactStyle.Heavy })
          await new Promise(r => setTimeout(r, 80))
        }
        break

      case 'crazy':
        // A chaotic, vibrating burst
        await Haptics.notification({ type: NotificationType.Warning })
        await Haptics.impact({ style: ImpactStyle.Heavy })
        break

      case 'cry':
        // A long, soft drop (like a tear falling)
        await Haptics.impact({ style: ImpactStyle.Light })
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }), 200)
        break

      case 'sleep':
        // A very subtle, slow "fade out"
        await Haptics.impact({ style: ImpactStyle.Light })
        break
    }
  } catch (e) {
    // Graceful fallback for non-native environments
  }
}