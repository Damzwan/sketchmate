import { User } from '@/types/server.types'
import Compressor from 'compressorjs'
import { LocalStorage } from '@/types/storage.types'
import router from '@/router'
import { StatusBar } from '@capacitor/status-bar'
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar'
import { isPlatform } from '@ionic/vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { AppColorConfig, colorsPerRoute } from '@/config/colors.config'
import { Preferences } from '@capacitor/preferences'
import { useToast } from '@/service/toast.service'
import { initializeApp } from 'firebase/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { account_blob } from '@/config/general.config'

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

export function senderImg(user: User | undefined, sender: string) {
  if (!user) return ''
  return user._id == sender ? user.img : user.mate!.img
}

export function senderName(user: User | undefined, sender: string) {
  if (!user) return ''
  return user._id == sender ? user.name : user.mate!.name
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
  const mate = await Preferences.get({ key: LocalStorage.mate })

  SplashScreen.hide()

  const end = 300
  const jump = 50
  let start = 0

  const config = mate.value ? colorsPerRoute[FRONTEND_ROUTES.draw] : colorsPerRoute[FRONTEND_ROUTES.connect]

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

export async function checkPreferenceConsistency(user: User) {
  const [mate, img] = await Promise.all([
    Preferences.get({ key: LocalStorage.mate }),
    Preferences.get({ key: LocalStorage.img })
  ])

  if (user.mate && !mate.value) {
    await Preferences.set({ key: LocalStorage.mate, value: 'true' })
    router.push(FRONTEND_ROUTES.draw)
  } else if (!user.mate && mate.value) {
    await Preferences.remove({ key: LocalStorage.mate })

    // Cannot be used immediately :(
    setTimeout(() => {
      const { toast } = useToast()
      toast('You got unmatched', { color: 'danger' })
    }, 500)

    router.push(FRONTEND_ROUTES.connect)
  }

  if (!img.value) Preferences.set({ key: LocalStorage.img, value: user.img })
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
