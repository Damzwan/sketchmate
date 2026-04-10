import mixpanel from 'mixpanel-browser/src/loaders/loader-module-core'
import { IS_DEV, IS_PROD, isNative } from '@/helper/general.helper'

export enum mixpanelEvents {
  presentPaywall = 'paywall-present',
}


export const initMixpanel = () => {
  const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN
  mixpanel.init(MIXPANEL_TOKEN, {
    api_host: 'https://api-eu.mixpanel.com',
    persistence: 'localStorage',
    debug: IS_DEV,
    batch_requests: !IS_DEV
  })
}

export function mixpanelIdentify(userId: string) {
  mixpanel.identify(userId)
}

export const trackEvent = (name: string, properties?: Record<string, any>) => {
  if (IS_DEV) return
  mixpanel.track(name, {
    ...properties,
    platform: isNative() ? 'mobile' : 'desktop'
  })
}