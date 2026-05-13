import { useAPI } from '@/service/api/api.service'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { Canvas } from 'fabric'
import { canvasToBuffer, exportBoundingBoxImage } from '@/draw/helpers/export.helper'
import { CreateBalloonPostRes, Res } from '@/types/server.types'
import { ref } from 'vue'
import { socketSend } from '@/service/api/socket/socket.service'

export function useDrawSendService(c: () => Canvas | null) {
  const api = useAPI()
  const isSendingDrawing = ref(false)
  const { user } = storeToRefs(useAuthStore())

  async function send(
    mates: string[],
    optionalData?: { img?: ArrayBuffer; canvas?: string, aspect_ratio?: number }
  ) {
    const canvas = c()
    if (!canvas) return

    isSendingDrawing.value = true

    let finalImg = optionalData?.img
    let aspect_ratio = optionalData?.aspect_ratio

    if (!finalImg) {
      const exported = await exportBoundingBoxImage(canvas)
      if (!exported) return // TODO necessary?
      aspect_ratio = exported.aspect_ratio
      finalImg = await canvasToBuffer(exported.img as any)
    }

    // Use provided JSON or stringify the current canvas
    const drawingData = JSON.stringify(optionalData?.canvas ?? canvas.toJSON())

    await socketSend({
      _id: user.value!._id,
      followers: [...mates],
      drawing: drawingData,
      img: finalImg,
      name: user.value!.name,
      aspect_ratio: aspect_ratio ?? 1
    })

  }

  async function createBalloon(message: string, optionalData?: {
    img?: ArrayBuffer;
    canvas?: string
    aspect_ratio?: number
  }): Promise<Res<CreateBalloonPostRes>> {
    const canvas = c()
    if (!canvas) return

    let finalImg = optionalData?.img
    let aspect_ratio = optionalData?.aspect_ratio

    if (!finalImg) {
      const exported = await exportBoundingBoxImage(canvas)
      if (!exported) return // TODO necessary?
      aspect_ratio = exported.aspect_ratio
      finalImg = await canvasToBuffer(exported.img as any)
    }

    const drawingData = JSON.stringify(optionalData?.canvas ?? canvas.toJSON())


    return await api.createBalloon({
      sender: user.value!._id,
      message,
      aspect_ratio: aspect_ratio ?? 1,
      drawing: drawingData,
      img: finalImg
    })
  }

  return { send, createBalloon, isSendingDrawing }
}
