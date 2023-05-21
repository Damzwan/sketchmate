import { Share } from '@capacitor/share'
import { useToast } from '@/service/toast.service'
import { Clipboard } from '@capacitor/clipboard'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { isPlatform } from '@ionic/vue'
import { useShare } from '@vueuse/core'

const { toast } = useToast()
const { share, isSupported } = useShare()

export async function shareUrl(url: string, title = '', dialogTitle = '') {
  const can_share = await Share.canShare()
  if (isPlatform('capacitor') && can_share.value) {
    await Share.share({
      title: title,
      text: url,
      dialogTitle: dialogTitle
    })
  } else if (isSupported.value) {
    await share({
      title: title,
      text: url
    })
  } else {
    await Clipboard.write({
      string: url
    })
    toast('Copied url!')
  }
}

async function urlToBase64(img_url: string) {
  const response = await fetch(img_url)
  const blob = await response.blob()

  const reader = new FileReader()
  reader.readAsDataURL(blob)
  const base64data: any = await new Promise(resolve => {
    reader.onloadend = () => resolve(reader.result)
  })
  return base64data
}

export async function shareImg(
  img_url: string,
  title = undefined,
  description = undefined,
  dialogTitle = 'Share image'
) {
  const can_share = await Share.canShare()
  const base64 = await urlToBase64(img_url)
  if (isPlatform('capacitor') && can_share.value) {
    const savedFile = await Filesystem.writeFile({
      path: 'sketchmate_img.jpg',
      data: base64.toString().split(',')[1],
      directory: Directory.Cache
    })

    await Share.share({
      title: title,
      text: description,
      files: [savedFile.uri],
      dialogTitle: dialogTitle
    })
  } else if (isSupported.value) {
    const blob = await (await fetch(base64)).blob()
    const file = new File([blob], 'SketchMate_image.png', { type: blob.type })
    await share({ files: [file] })
  } else {
    try {
      await Clipboard.write({
        image: base64.toString()
      })
      toast('Copied image!')
    } catch (e) {
      toast('Copied image link!')
      await Clipboard.write({
        string: img_url
      })
    }
  }
}