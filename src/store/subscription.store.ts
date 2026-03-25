import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Purchases } from '@revenuecat/purchases-capacitor'
import { isNative } from '@/helper/general.helper'
import { PAYWALL_RESULT, RevenueCatUI } from '@revenuecat/purchases-capacitor-ui'

export const useSubscriptionStore = defineStore('subscription', () => {
  const isPro = ref(false)
  const isLoading = ref(true)

  async function checkProStatus() {
    if (!isNative()) return
    isLoading.value = true
    try {
      const { customerInfo } = await Purchases.getCustomerInfo()
      isPro.value = typeof customerInfo.entitlements.active['SketchMate Pro'] !== 'undefined'
    } catch (e) {
      console.error('Error fetching customer info from RevenueCat', e)
      isPro.value = false
    } finally {
      isLoading.value = false
    }
  }

  // Helper to reset status (e.g., call this when the user logs out)
  function clearSubscriptionState() {
    isPro.value = false
  }

  async function presentPaywall(): Promise<boolean> {
    const { result } = await RevenueCatUI.presentPaywall()
    void checkProStatus()

    const successStates = [
      PAYWALL_RESULT.PURCHASED,
      PAYWALL_RESULT.RESTORED
    ]

    return successStates.includes(result)
  }

  async function manageSubscription() {
    try {
      await RevenueCatUI.presentCustomerCenter()
      void checkProStatus()
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
    manageSubscription
  }
})