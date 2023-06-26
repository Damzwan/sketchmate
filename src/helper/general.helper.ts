import { User } from '@/types/server.types'
import Compressor from 'compressorjs'
import { LocalStorage } from '@/types/storage.types'
import router from '@/router'
import { StatusBar } from '@capacitor/status-bar'
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar'
import { isPlatform } from '@ionic/vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { AppColorConfig, colorsPerRoute } from '@/config/colors.config'
import { SplashScreen } from '@capacitor/splash-screen'
import { Preferences } from '@capacitor/preferences'

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

export function svg(path: string) {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 24 24"><path d="${path}"/></svg>`
}

export function getCurrentRoute(): FRONTEND_ROUTES {
  return router.currentRoute.value.fullPath.split('/')[1] as FRONTEND_ROUTES
}

export function setAppColors(colorConfig: AppColorConfig) {
  if (!isPlatform('capacitor')) return
  NavigationBar.setColor({ color: colorConfig.navigationBar })
  StatusBar.setBackgroundColor({ color: colorConfig.statusBar })
}

export async function hideLoading() {
  await SplashScreen.hide()
  const mate = await Preferences.get({ key: LocalStorage.mate })

  mate.value
    ? setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
    : setAppColors(colorsPerRoute[FRONTEND_ROUTES.connect])

  // TODO kind of hacky
  setTimeout(() => {
    mate.value
      ? setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
      : setAppColors(colorsPerRoute[FRONTEND_ROUTES.connect])
  }, 50)

  setTimeout(() => {
    mate.value
      ? setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])
      : setAppColors(colorsPerRoute[FRONTEND_ROUTES.connect])
  }, 100)
}

export async function checkMateConsistency(user: User) {
  const mate = await Preferences.get({ key: LocalStorage.mate })

  if (user.mate && !mate.value) {
    await Preferences.set({ key: LocalStorage.mate, value: 'true' })
    router.go(0)
  } else if (!user.mate && mate.value) {
    await Preferences.remove({ key: LocalStorage.mate })
    router.go(0)
  }
}
