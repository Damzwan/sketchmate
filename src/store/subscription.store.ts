import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Purchases } from '@revenuecat/purchases-capacitor'
import { isNative } from '@/helper/general.helper'
import { PAYWALL_RESULT, RevenueCatUI } from '@revenuecat/purchases-capacitor-ui'
import { mixpanelEvents, trackEvent } from '@/service/mixpanel'
import { updateProfile } from '@/service/api/user.api'
import { useToast } from '@/service/toast.service' // Ensure this is imported

export const useSubscriptionStore = defineStore('subscription', () => {
  const isPro = ref(false)
  const isLoading = ref(true)
  const showConfetti = ref(false)

  /**
   * Pushes the current entitlement status to our MongoDB
   */
  async function syncWithBackend(status: boolean) {
    try {
      const tier = status ? 'pro' : 'free'
      await updateProfile({ subscription_tier: tier })
    } catch (e) {
      console.error('Failed to sync subscription tier to backend', e)
    }
  }

  async function checkProStatus() {
    if (!isNative()) {
      isLoading.value = false
      return
    }
    isLoading.value = true
    try {
      const { customerInfo } = await Purchases.getCustomerInfo()
      const active = typeof customerInfo.entitlements.active['SketchMate Pro'] !== 'undefined'

      // If the status has changed since the last check, sync it
      if (active !== isPro.value) {
        isPro.value = active
        await syncWithBackend(active)
      }
    } catch (e) {
      console.error('Error fetching customer info from RevenueCat', e)
      isPro.value = false
    } finally {
      isLoading.value = false
    }
  }

  async function presentPaywall(): Promise<boolean> {
    if (!isNative()) {
      const { toast } = useToast()
      toast('Pro features are currently available only on the mobile app! 📱', { color: 'warning' })
      return false
    }
    trackEvent(mixpanelEvents.presentPaywall)
    const { result } = await RevenueCatUI.presentPaywall()

    const successStates = [
      PAYWALL_RESULT.PURCHASED,
      PAYWALL_RESULT.RESTORED
    ]

    const isSuccess = successStates.includes(result)

    if (isSuccess) {
      showConfetti.value = true
      isPro.value = true
      await syncWithBackend(true) // Immediate sync on purchase
    } else {
      // Re-check just in case they cancelled but had an existing sub
      await checkProStatus()
    }

    return isSuccess
  }

  function clearSubscriptionState() {
    isPro.value = false
  }

  async function manageSubscription() {
    try {
      await RevenueCatUI.presentCustomerCenter()
      await checkProStatus()
    } catch (error) {
      console.error('Error opening Customer Center', error)
    }
  }

  return {
    isPro,
    isLoading,
    checkProStatus,
    clearSubscriptionState,
    presentPaywall,
    manageSubscription,
    showConfetti
  }
})