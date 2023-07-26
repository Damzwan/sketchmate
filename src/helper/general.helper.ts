import { User } from '@/types/server.types'
import Compressor from 'compressorjs'
import { LocalStorage } from '@/types/storage.types'
import router from '@/router'
import { StatusBar } from '@capacitor/status-bar'
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar'
import { isPlatform, useIonRouter } from '@ionic/vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { AppColorConfig, colorsPerRoute } from '@/config/colors.config'
import { SplashScreen } from '@capacitor/splash-screen'
import { Preferences } from '@capacitor/preferences'
import { useToast } from '@/service/toast.service'

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

export function setAppColors(colorConfig: AppColorConfig) {
  if (!isPlatform('capacitor')) return
  NavigationBar.setColor({ color: colorConfig.navigationBar })
  StatusBar.setBackgroundColor({ color: colorConfig.statusBar })
}

export async function hideLoading() {
  await SplashScreen.hide()
  const mate = await Preferences.get({ key: LocalStorage.mate })

  const end = 300
  const jump = 25
  let start = 0

  const interval = setInterval(() => {
    if (start >= end) clearInterval(interval)
    start += jump
    mate.value
      ? setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
      : setAppColors(colorsPerRoute[FRONTEND_ROUTES.connect])
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
