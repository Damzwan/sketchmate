import { User } from '@/types/server.types'
import Compressor from 'compressorjs'

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

export async function compressImg(file: File | Blob, maxSize = 500, quality = 0.6): Promise<File> {
  return new Promise(resolve => {
    new Compressor(file, {
      quality: quality,
      maxWidth: maxSize,
      maxHeight: maxSize,
      success(result) {
        resolve(result as File)
      },
      error(err) {
        console.log(err.message)
      }
    })
  })
}

export async function resizeImage(file: File | Blob, maxSize = 500): Promise<Blob | File> {
  return new Promise(resolve => {
    new Compressor(file, {
      maxWidth: maxSize,
      maxHeight: maxSize,
      mimeType: 'image/png',
      success(result) {
        resolve(result)
      },
      error(err) {
        console.log(err.message)
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
