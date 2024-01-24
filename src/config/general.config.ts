import { isNative } from '@/helper/general.helper'

export const account_blob = 'https://sketchmate.blob.core.windows.net/account'
export const app_store_link = 'https://play.google.com/store/apps/details?id=ninja.sketchmate.app'

export const login_page = isNative() ? `ninja.sketchmate.app://dev-sdfuotf5xagn8qqb.eu.auth0.com/capacitor/ninja.sketchmate.app/callback` : `${window.location.origin}/login`
