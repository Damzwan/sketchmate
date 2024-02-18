import { Mate } from '@/types/server.types'
import Compressor from 'compressorjs'
import router from '@/router'
import { StatusBar } from '@capacitor/status-bar'
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar'
import { isPlatform } from '@ionic/vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { AppColorConfig, colorsPerRoute } from '@/config/colors.config'
import { initializeApp } from 'firebase/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { account_blob } from '@/config/general.config'
import avatar from '@/assets/avatar.svg'
import { Device } from '@capacitor/device'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { Ref } from 'vue'

export async function imgUrlToFile(imgUrl: string) {
  const blob = await fetch(imgUrl).then(res => res.blob())
  return new File([blob], 'image.jpg', { type: blob.type })
}

export function sortDates(arr: string[]) {
  return arr.sort((a, b) => {
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
  quality: 0.7,
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
    NavigationBar.setColor({ color: colorConfig.navigationBar }),
    StatusBar.setBackgroundColor({ color: colorConfig.statusBar })
  ])
}

export async function checkColorsSet(colorConfig: AppColorConfig) {
  if (!isNative()) return
  const colors = await getAppColors()
  if (!colors) return false

  return colorConfig.navigationBar == colors[0].color && colorConfig.statusBar == colors[1].color
}

export async function getAppColors() {
  if (!isNative()) return
  return await Promise.all([NavigationBar.getColor(), StatusBar.getInfo()])
}

// TODO this is the uglies code ever xd
export async function hideLoading() {
  await SplashScreen.hide()

  const end = 300
  const jump = 50
  let start = 0

  const config = colorsPerRoute[router.currentRoute.value.path.substring(1) as FRONTEND_ROUTES]

  const interval = setInterval(async () => {
    const colorsSet = await checkColorsSet(config)

    if (start >= end || colorsSet) {
      clearInterval(interval)
      return
    }
    start += jump
    await setAppColors(config)
  }, jump)
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

export function compareVersions(currentVersion: string, minimumVersion: string) {
  const current = currentVersion.split('.').map(Number)
  const minimum = minimumVersion.split('.').map(Number)


  for (let i = 0; i < current.length; i++) {
    if (current[i] < minimum[i]) {
      return -1 // Current version is lower
    } else if (current[i] > minimum[i]) {
      return 1  // Current version is higher
    }
  }

  return 0  // Versions are equal
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
