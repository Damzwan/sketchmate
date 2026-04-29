import { Mate } from '@/types/server.types'
import Compressor from 'compressorjs'
import router from '@/router'
import { StatusBar } from '@capacitor/status-bar'
import { NavigationBar } from '@capgo/capacitor-navigation-bar'
import { isPlatform, useBackButton } from '@ionic/vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { AppColorConfig } from '@/config/colors.config'
import { initializeApp } from 'firebase/app'
import { account_blob, minimum_age_social_features } from '@/config/general.config'
import avatar from '@/assets/avatar.svg'
import { Device } from '@capacitor/device'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { Ref, watch } from 'vue'
import { SplashScreen } from '@capacitor/splash-screen'
import { useMenuStore } from '@/store/menu.store'
import { Menu } from '@/draw/types/draw.types'
import { useAPI } from '@/service/api/api.service'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/service/toast.service'
import { ToastDuration } from '@/types/toast.types'
import { storeToRefs } from 'pinia'
import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'
import { useSessionStore } from '@/store/session.store'
import { socketJoinRoom } from '@/service/api/socket/drawSyncing.socket'
import { socketLoggedInPromise } from '@/service/api/socket/socket.service'
import { Purchases } from '@revenuecat/purchases-capacitor'

export const IS_PROD = import.meta.env.VITE_ENVIRONMENT === 'prod'
export const IS_DEV = !IS_PROD

export function sortDates(arr: string[]) {
  return (arr as any).toSorted((a: any, b: any) => {
    return new Date(b).getTime() - new Date(a).getTime()
  })
}

// TODO does not work well for mobile

type CompressImgReturnType = 'file' | 'blob'

export interface CompressImgOptions {
  size?: number
  quality?: number
  returnType?: CompressImgReturnType
}

const compressImgBaseSettings: CompressImgOptions = {
  quality: 0.6,
  returnType: 'file'
}

export async function compressImg(file: File | Blob | string, options?: CompressImgOptions): Promise<Blob | File> {
  const o: CompressImgOptions = { ...compressImgBaseSettings, ...options }

  if (typeof file === 'string') {
    file = await fetch(file).then(res => res.blob())
  }


  return new Promise((resolve, reject) => {
    new Compressor(file as Blob | File, {
      quality: o.quality,
      maxWidth: o.size,
      maxHeight: o.size,
      mimeType: 'image/webp',
      success(result) {
        if (o.returnType === 'file') {
          resolve(result as File)
        } else if (o.returnType === 'blob') {
          resolve(result as Blob)
        } else {
          reject(new Error('Invalid returnType. Expected "blob" or "file".'))
        }
      },
      error(err) {
        console.log(err.message)
        reject(err)
      }
    })
  })
}

export function senderImg(mate: Mate | undefined) {
  return mate ? mate.img : avatar
}

export function senderName(mate: Mate | undefined) {
  return mate ? mate.name : 'Anonymous'
}

export function svg(path: string, fill?: string) {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 24 24" fill="${
    fill ? fill : ''
  }"><path d="${path}"/></svg>`
}

export function getCurrentRoute(): FRONTEND_ROUTES {
  return router.currentRoute.value.path.split('/')[1] as FRONTEND_ROUTES
}

export async function setAppColors(colorConfig: AppColorConfig) {
  if (!isNative()) return
  await Promise.all([
    NavigationBar.setNavigationBarColor({ color: colorConfig.navigationBar }),
    StatusBar.setBackgroundColor({ color: colorConfig.statusBar })
  ])
}


export function isMobile() {
  return isPlatform('mobile') || isPlatform('capacitor') || isPlatform('android') || isPlatform('ios')
}

export function isNative() {
  return isPlatform('capacitor')
}

export function isIOS() {
  return isPlatform('ios')
}

export function isSafari() {
  const userAgentString = navigator.userAgent
  const chromeAgent = userAgentString.indexOf('Chrome') > -1
  let safariAgent = userAgentString.indexOf('Safari') > -1
  if (chromeAgent && safariAgent) safariAgent = false
  return safariAgent
}

export function blurIonInput(ionInput: any) {
  ionInput.$el.querySelector('input').blur()
}

export function initFirebase() {
  const firebaseConfig = {
    apiKey: 'AIzaSyA0QXGKwWkDCMkyL4SEvdHGlaVQNyc7FUk',
    authDomain: 'sketchmate-b5977.firebaseapp.com',
    projectId: 'sketchmate-b5977',
    storageBucket: 'sketchmate-b5977.appspot.com',
    messagingSenderId: '454566721535',
    appId: '1:454566721535:web:019875100e884ea61519ca',
    measurementId: 'G-GD43HDZD3D'
  }

  initializeApp(firebaseConfig)
}

export function isRunningStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
}

export function showIosSafariInstructions() {
  return isIOS() && isSafari() && !isRunningStandalone()
}

export function getRandomStockAvatar() {
  const randomNum = Math.floor(Math.random() * 5) + 1
  return `${account_blob}/stock_${randomNum}.webp`
}

export async function generateDeviceFingerprint() {
  const info = await Device.getInfo()
  const userAgent = navigator.userAgent

  // Remove IP address from the user agent string

  // Extract browser name from the user agent string
  let browserName = 'Unknown'
  if (/(Edge|Edg)\/(\d+)/.test(userAgent)) {
    browserName = 'Microsoft Edge'
  } else if (/Firefox\//.test(userAgent)) {
    browserName = 'Firefox'
  } else if (/Chrome\//.test(userAgent)) {
    browserName = 'Chrome'
  } else if (/Safari\//.test(userAgent)) {
    browserName = 'Safari'
  }

  // Combine collected information to create a fingerprint
  return `${browserName}-${info.platform}-${info.model}`
}


export const getCurrentUser = async () => {
  const result = await FirebaseAuthentication.getCurrentUser()
  return result.user
}

export async function getCurrentAuthUser() {
  const result = await FirebaseAuthentication.getCurrentUser()
  return result.user
}

export function compareVersions(currentVersion: string, minimumVersion: string): number {
  const current = currentVersion.split('.').map(Number)
  const minimum = minimumVersion.split('.').map(Number)

  const maxLength = Math.max(current.length, minimum.length)

  for (let i = 0; i < maxLength; i++) {
    const v1 = current[i] || 0
    const v2 = minimum[i] || 0

    if (v1 < v2) return -1 // Current is older
    if (v1 > v2) return 1  // Current is newer
  }

  return 0 // Exactly the same
}

export async function installPWA(installPrompt: Ref<any>) {
  if (installPrompt.value) {
    installPrompt.value.prompt()
    const { outcome } = await installPrompt.value.userChoice
    if (outcome === 'accepted') {
      installPrompt.value = null
    }
  }
}

export async function toDataUrl(blob: any) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export function shuffleArray<T = string>(array: any[]): Array<T> {
  const arr = [...array] // to avoid mutating original array
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export type DateOfBirthResponse = 'cancel' | 'allowed' | 'notAllowed'

export async function getDateOfBirthConfirmationResponse(): Promise<DateOfBirthResponse> {
  const { openMenu } = useMenuStore()
  const { updateUser } = useAPI()
  const { user } = storeToRefs(useAuthStore())
  const { toast } = useToast()


  openMenu(Menu.DateOfBirth)

  return new Promise((resolve) => {

    const listener = async (event: CustomEvent) => {
      document.removeEventListener('dateofbirth-response', listener as any)

      const dob = event.detail.response as Date | null

      if (!dob) return resolve('cancel') // user cancelled

      try {
        if (!user.value) return false
        void updateUser({ _id: user.value._id, date_of_birth: dob })
        user.value.date_of_birth = dob

        if (!isOldEnough(dob)) {
          toast('You must be at least 13 to use social features. Stay safe online!', {
            color: 'danger',
            duration: ToastDuration.long
          })

          resolve('notAllowed')
        } else {
          resolve('allowed')
        }
      } catch (err) {
        console.error('Failed to update DOB', err)
        resolve('cancel')
      }
    }

    document.addEventListener('dateofbirth-response', listener as any)
  })
}

/**
 * Calculate age in years based on a Date of Birth
 * @param dob Date of birth
 * @returns age in years (floating point)
 */
export function calculateAge(dob: Date): number {
  const ageMs = Date.now() - dob.getTime()
  return ageMs / (1000 * 60 * 60 * 24 * 365.25)
}

/**
 * Check if the age meets a minimum requirement
 * @param dob Date of birth
 * @returns true if age >= minimumAge, false otherwise
 */
export function isOldEnough(dob: Date): boolean {
  return calculateAge(dob) >= minimum_age_social_features
}

export function setupDeeplinkListener() {
  App.addListener('appUrlOpen', async (data: any) => {
    const url = new URL(data.url)
    const { redirectIntent } = storeToRefs(useSessionStore())


    // TODO i think we should come with a more clever approach to handle deep links, this is very messy. I think it is better to handle them here instead of at their respective page
    const roomId = url.searchParams.get('room_id')
    if (roomId) {
      const {} = useAuthStore()
      redirectIntent.value = window.location.pathname + window.location.search
      await socketLoggedInPromise // TODO only not crashing because of this part
      socketJoinRoom({ roomId, intent: 'join' })
      return
    }

    const { setQueryParams } = useSessionStore()
    setQueryParams(url.searchParams)

    const path = url.pathname.substring(1)
    router.push(path)
  })
}

export async function handleWebDeeplink() {
  const url = new URL(window.location.href)
  const roomId = url.searchParams.get('room_id')

  const { redirectIntent } = storeToRefs(useSessionStore())

  const { setQueryParams } = useSessionStore()
  setQueryParams(url.searchParams)

  // if (roomId) {
  //   redirectIntent.value = window.location.pathname + window.location.search
  //   await socketLoggedInPromise
  //   socketJoinRoom({ roomId, intent: 'join' })
  // }
}

export function setupPwa() {
  window.addEventListener('load', () => {
    navigator.serviceWorker.controller?.postMessage({
      type: 'client-ready'
    })
  })
}

export function setupWidget() {
  Preferences.set({
    key: LocalStorage.backend_url,
    value: import.meta.env.VITE_BACKEND as string
  })
}

export async function lazyLoadDrawingModules() {
  await Promise.all([import ('fabric')])
}

export function setupBackButtonBehavior() {
  const { isOpen, dismiss } = useToast()


  // Default handler: exit the app
  useBackButton(-1, () => {
    if (!window.history.state?.back) {
      App.exitApp()
    }
  })

  // Toast handler: close toast first
  useBackButton(10, next => {

    if (isOpen.value) dismiss()
    else next()
  })
}

export function setupPWAPromptListener() {
  if (isNative()) return

  const { installPrompt } = storeToRefs(useSessionStore())

  window.addEventListener('beforeinstallprompt', e => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      installPrompt.value = undefined
      return
    }
    installPrompt.value = e
  })
}

export function setupRouterReadyWatcher(
  isRouterReady: Ref<boolean>,
  isAuthLoading: Ref<boolean>
) {
  router.isReady().then(() => {
    isRouterReady.value = true
  })

  if (isNative()) {
    const unwatch = watch(
      [isAuthLoading, isRouterReady],
      ([authLoading, routerReady]) => {
        if (routerReady && !authLoading) {
          SplashScreen.hide({ fadeOutDuration: 200 })
          unwatch()
        }
      },
      { immediate: true }
    )
  }
}

export function isMac() {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

export async function initBilling() {
  if (!isNative()) return

  const env = import.meta.env.VITE_ENVIRONMENT
  const testKey = env === 'prod' ? import.meta.env.VITE_REVENUECAT_ANDROID_KEY : import.meta.env.VITE_REVENUECAT_TEST_KEY

  if (!testKey) {
    console.error('Missing RevenueCat Test Key! Check your .env file.')
    return
  }

  try {
    await Purchases.configure({ apiKey: testKey })
    console.log('RevenueCat configured successfully with Test Key!')
  } catch (error) {
    console.error('Error configuring RevenueCat:', error)
  }
}

export function generateRandomCode() {
  const code = Math.floor(Math.random() * 10000)
  return String(code).padStart(4, '0')
}

// A tiny seeded random helper
export const mulberry32 = (a: number) => {
  return () => {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}