import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { useToast } from '@/service/toast.service'
import { uploadProfileImg } from '@/service/api/user.api'

export function useProfileUpload() {
  const { user } = storeToRefs(useAuthStore())
  const { toast } = useToast()

  const uploadImage = async (newImgBase64: string, mimeType = 'image/webp') => {
    if (!user.value) return

    const u = user.value
    const previousImg = u.img
    u.img = newImgBase64 // Optimistic update

    try {
      const res = await fetch(newImgBase64)
      const blob = await res.blob()

      // Pass mimeType down to name file correctly on backend (.gif vs .webp)
      const uploadRes = await uploadProfileImg(blob, previousImg, mimeType)

      if (uploadRes?.url) {
        if (u.img === newImgBase64) u.img = uploadRes.url
        toast('Updated profile picture!')
      } else {
        if (u.img === newImgBase64) u.img = previousImg
        toast('Failed to upload image', { color: 'danger' })
      }
    } catch (err) {
      if (u.img === newImgBase64) u.img = previousImg
      toast('Failed to upload image', { color: 'danger' })
    }
  }

  return { uploadImage }
}