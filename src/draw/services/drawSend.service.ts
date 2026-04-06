import { useAPI } from '@/service/api/api.service'
import { useSocketService } from '@/service/api/socket/socket.service'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { Canvas } from 'fabric'
import { canvasToBuffer, exportBoundingBoxImage } from '@/draw/helpers/export.helper'
import { CreateBalloonPostRes, Res } from '@/types/server.types'
import { ref } from 'vue'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'

export function useDrawSendService(c: () => Canvas | null) {
  const api = useAPI()
  const socketAPI = useSocketService()
  const isSendingDrawing = ref(false)
  const { user } = storeToRefs(useAuthStore())
  const drawStore = useDrawStore()

  async function send(
    mates: string[],
    optionalData?: { img?: ArrayBuffer; canvas?: string }
  ) {
    const canvas = c()
    if (!canvas) return

    isSendingDrawing.value = true

    let finalImg = optionalData?.img

    if (!finalImg) {
      const exported = await exportBoundingBoxImage(canvas)
      if (!exported) return
      finalImg = await canvasToBuffer(exported.img)
    }

    // Use provided JSON or stringify the current canvas
    const drawingData = JSON.stringify(optionalData?.canvas ?? canvas.toJSON())

    await socketAPI.send({
      _id: user.value!._id,
      followers: [user.value!._id, ...mates],
      drawing: drawingData,
      img: finalImg,
      name: user.value!.name
    })

    const { roomId } = useDrawSyncer()
    if (roomId) return

    drawStore.reset()
  }

  async function createBalloon(message: string): Promise<Res<CreateBalloonPostRes>> {
    const canvas = c()
    if (!canvas) return

    const img = await exportBoundingBoxImage(canvas)
    if (!img) return

    return await api.createBalloon({
      sender: user.value!._id,
      message,
      aspect_ratio: img.aspect_ratio,
      drawing: JSON.stringify(canvas.toJSON()),
      img: await canvasToBuffer(img.img)
    })
  }

  return { send, createBalloon, isSendingDrawing }
}
