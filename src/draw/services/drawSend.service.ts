import { useAPI } from '@/service/api/api.service'
import { useSocketService } from '@/service/api/socket/socket.service'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { Canvas } from 'fabric'
import { canvasToBuffer, exportBoundingBoxImage } from '@/draw/helpers/export.helper'
import { CreateBalloonPostRes, Res } from '@/types/server.types'
import { ref } from 'vue'
import { useDrawStore } from '@/draw/store/draw.store'

export function useDrawSendService(c: () => Canvas | null) {
  const api = useAPI()
  const socketAPI = useSocketService()
  const isSendingDrawing = ref(false)
  const { user } = storeToRefs(useAuthStore())
  const drawStore = useDrawStore()

  async function send(mates: string[]) {
    const canvas = c()
    if (!canvas) return

    isSendingDrawing.value = true
    const img = await exportBoundingBoxImage(canvas)
    if (!img) return

    await socketAPI.send({
      _id: user.value!._id,
      followers: [user.value!._id, ...mates],
      drawing: JSON.stringify(canvas.toJSON()),
      img: await canvasToBuffer(img.img),
      name: user.value!.name,
      aspect_ratio: img.aspect_ratio
    })

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
