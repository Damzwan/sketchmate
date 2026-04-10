import { ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { BrushType } from '@/draw/types/draw.types'

const BRUSH_USAGE_KEY_PREFIX = 'brush_usage_'
const LAST_RESET_KEY = 'brush_usage_last_reset' // Key to store the date
const FREE_TRIAL_LIMIT = 3

export function useBrushTrial() {
  const trialCount = ref<Record<string, number>>({})

  // Internal helper to get today's date string (YYYY-MM-DD)
  const getTodayString = () => new Date().toISOString().split('T')[0]

  const checkAndResetIfNewDay = async () => {
    const today = getTodayString()
    const { value: lastReset } = await Preferences.get({ key: LAST_RESET_KEY })

    if (lastReset !== today) {
      // It's a new day! Clear all brush usage keys.
      await Preferences.set({ key: LAST_RESET_KEY, value: today })
      return true
    }
    return false
  }

  const loadUsage = async (type: BrushType) => {
    const isNewDay = await checkAndResetIfNewDay()

    if (isNewDay) {
      // If it's a new day, we treat the count as 0 and update storage
      await Preferences.set({ key: `${BRUSH_USAGE_KEY_PREFIX}${type}`, value: '0' })
      trialCount.value[type] = 0
      return 0
    }

    const { value } = await Preferences.get({ key: `${BRUSH_USAGE_KEY_PREFIX}${type}` })
    const count = value ? parseInt(value, 10) : 0
    trialCount.value[type] = count
    return count
  }

  const useBrush = async (type: BrushType): Promise<boolean> => {
    const currentCount = await loadUsage(type)

    if (currentCount < FREE_TRIAL_LIMIT) {
      const newCount = currentCount + 1
      await Preferences.set({
        key: `${BRUSH_USAGE_KEY_PREFIX}${type}`,
        value: newCount.toString()
      })
      trialCount.value[type] = newCount
      return true
    }

    return false
  }

  const remainingUses = (type: BrushType) => {
    const used = trialCount.value[type] || 0
    return Math.max(0, FREE_TRIAL_LIMIT - used)
  }

  return {
    useBrush,
    loadUsage,
    remainingUses,
    limit: FREE_TRIAL_LIMIT
  }
}