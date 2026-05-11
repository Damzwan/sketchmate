import { Share } from '@capacitor/share'
import { useToast } from '@/service/toast.service'
import { Clipboard } from '@capacitor/clipboard'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { useShare } from '@vueuse/core'
import { isMobile, isNative } from '@/helper/general.helper'
import { ToastDuration } from '@/types/toast.types'
import { CapacitorHttp } from '@capacitor/core'
import { FRONTEND_ROUTES } from '@/types/router.types'

const { toast } = useToast()
const { share, isSupported } = useShare()

export async function shareUrl(url: string, title = '', dialogTitle = '', toastMessage = 'Copied personal link. Share this with a friend to connect') {
  const can_share = await Share.canShare()
  if (isNative() && can_share.value) {
    await Share.share({
      title: title,
      text: url,
      dialogTitle: dialogTitle
    })
  } else if (isSupported.value && isMobile()) {
    await share({
      title: title,
      url: url
    })
  } else {
    await Clipboard.write({
      string: url
    })
    toast(toastMessage, { duration: ToastDuration.medium })
  }
}

async function urlToBase64(img_url: string) {
  // const response = await fetch(img_url, {mode: 'cors'})
  const response = await CapacitorHttp.get({ url: img_url, responseType: 'blob' })
  return 'data:image/png;base64,' + response.data

}

export async function shareImg(
  img_url: string,
  title = undefined,
  description = undefined,
  dialogTitle = 'Share image'
) {
  const can_share = await Share.canShare()
  if (isNative() && can_share.value) {
    const base64 = await urlToBase64(img_url)
    const savedFile = await Filesystem.writeFile({
      path: 'sketchmate_img.png',
      data: base64.toString().split(',')[1],
      directory: Directory.Cache
    })

    await Share.share({
      title: title,
      text: description,
      files: [savedFile.uri],
      dialogTitle: dialogTitle
    })
  } else {
    try {
      const response = await fetch(img_url, {});
      const blob = await response.blob();

      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      toast('Copied image')
    }
    catch (e) {
      await Clipboard.write({
        string: img_url
      })
      toast('Copied image link!')

    }
  }
}

export function createPersonalShareLink(userID: string, connectRoute: string) {
  let baseUrl
  if (isNative()) baseUrl = import.meta.env.VITE_FRONTEND as string
  else baseUrl = `${window.location.origin}`
  return `${baseUrl}${connectRoute}?mate=${userID}`
}

export function createRoomLink(roomId: string) {
  let baseUrl
  if (isNative()) baseUrl = import.meta.env.VITE_FRONTEND as string
  else baseUrl = `${window.location.origin}`
  return `${baseUrl}/${FRONTEND_ROUTES.draw}?room_id=${roomId}`
}

export async function shareImages(
  img_urls: string[],
  title = 'Check out my sketches!',
  dialogTitle = 'Share images'
) {
  const can_share = await Share.canShare()

  if (isNative() && can_share.value) {
    const fileUris = []

    // Convert and save all images to device cache
    for (let i = 0; i < img_urls.length; i++) {
      const base64 = await urlToBase64(img_urls[i])
      const savedFile = await Filesystem.writeFile({
        path: `sketchmate_share_${i}.png`,
        data: base64.toString().split(',')[1],
        directory: Directory.Cache
      })
      fileUris.push(savedFile.uri)
    }

    await Share.share({
      title: title,
      files: fileUris,
      dialogTitle: dialogTitle
    })
  } else {
    // Ultimate fallback if sharing is totally unsupported
    toast(`Copied ${img_urls.length} image links!`)
    await Clipboard.write({ string: img_urls.join('\n') })
  }
}