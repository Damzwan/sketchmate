import { Share } from '@capacitor/share'
import { useToast } from '@/service/toast.service'
import { Clipboard } from '@capacitor/clipboard'
import { Directory, Filesystem } from '@capacitor/filesystem'

const { toast } = useToast()

export async function shareUrl(url: string, title = '', dialogTitle = '') {
  const can_share = await Share.canShare()

  if (can_share.value) {
    await Share.share({
      title: title,
      text: url,
      dialogTitle: dialogTitle
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
  const base64 = await urlToBase64(img_url)
  const can_share = await Share.canShare()
  if (can_share.value) {
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
