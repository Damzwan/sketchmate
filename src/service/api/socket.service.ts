import { io, Socket } from 'socket.io-client'
import {
  CommentParams,
  CommentRes,
  InboxItem,
  MatchParams,
  MatchRes,
  NotificationType,
  Res,
  SendParams,
  SOCKET_ENDPONTS,
  SocketAPI,
  SocketLoginParams,
  UnMatchParams
} from '@/types/server.types'
import { useAppStore } from '@/store/app.store'
import { storeToRefs } from 'pinia'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useToast } from '@/service/toast.service'
import { dismissButton, matchButton, viewCommentButton, viewDrawingButton } from '@/config/toast.config'
import { ToastDuration } from '@/types/toast.types'
import { EventBus } from '@/main'
import { LocalStorage } from '@/types/storage.types'
import router from '@/router'
import { Preferences } from '@capacitor/preferences'

let socket: Socket | undefined

let socketServiceInstance: SocketAPI | null = null

export function useSocketService(): SocketAPI {
  if (!socketServiceInstance) socketServiceInstance = createSocketService()
  return socketServiceInstance
}

export function createSocketService(): SocketAPI {
  const { addComment } = useAppStore()
  const { user, isLoading, inbox, notificationRouteLoading } = storeToRefs(useAppStore())
  const { toast } = useToast()

  async function connect(): Promise<void> {
    if (socket) return
    socket = io(import.meta.env.VITE_BACKEND as string, {
      withCredentials: true
    })

    socket.on(SOCKET_ENDPONTS.match, (params: Res<MatchRes>) => {
      if (params) {
        user.value!.mate = params.mate
        toast('Matched!', { buttons: [matchButton, dismissButton], duration: 5000 })
        Preferences.set({ key: LocalStorage.mate, value: 'true' })

        router.replace(FRONTEND_ROUTES.mate)
      } else {
        toast('Failed to connect to mate', { color: 'danger' })

        const appStore = useAppStore()
        appStore.consumeNotificationLoading(NotificationType.match)
      }
    })

    socket.on(SOCKET_ENDPONTS.unmatch, async () => {
      isLoading.value = false
      Preferences.remove({ key: LocalStorage.mate })
      toast('Unmatched', { buttons: [dismissButton], duration: 5000, color: 'warning' })

      user.value!.mate = undefined
      inbox.value = []
      user.value!.inbox = []

      await router.replace(FRONTEND_ROUTES.connect)
    })

    socket.on(SOCKET_ENDPONTS.send, (params: Res<InboxItem>) => {
      isLoading.value = false
      if (params) {
        user.value?.inbox.push(params._id)
        inbox.value?.push(params)
        const text = params.sender === user.value!._id ? 'Drawing sent!' : 'New drawing received'
        toast(text, {
          buttons: [dismissButton, viewDrawingButton(params._id)],
          duration: ToastDuration.long
        })
        if (params.sender === user.value?._id) EventBus.emit('reset-canvas')
      }
    })

    socket.on(SOCKET_ENDPONTS.comment, (params: Res<CommentRes>) => {
      if (params) {
        addComment(params)
        if (params.comment.sender != user.value!._id)
          toast(`${user.value!.mate!.name} commented on a drawing`, {
            buttons: [viewCommentButton(params.inbox_item_id)],
            duration: ToastDuration.medium
          })
      }
    })
  }

  async function disconnect(): Promise<void> {
    socket!.disconnect()
  }

  async function login(params: SocketLoginParams): Promise<void> {
    socket!.emit(SOCKET_ENDPONTS.login, params)
  }

  async function match(params: MatchParams): Promise<void> {
    notificationRouteLoading.value = NotificationType.match
    socket!.emit(SOCKET_ENDPONTS.match, params)
  }

  async function unMatch(params: UnMatchParams): Promise<void> {
    notificationRouteLoading.value = NotificationType.unmatch
    socket!.emit(SOCKET_ENDPONTS.unmatch, params)
  }

  async function send(params: SendParams): Promise<void> {
    const encoder = new TextEncoder() // Use TextEncoder to convert string to Uint8Array

    // Remove the img from params before stringify
    const img = params.img
    delete params.img

    const data = JSON.stringify(params)

    const pako = await import('pako')
    const compressedData = pako.deflate(encoder.encode(data))

    const chunkSize = 1024 // or whatever size you prefer

    // Send the text data
    for (let i = 0; i < compressedData.length; i += chunkSize) {
      const chunk = compressedData.slice(i, i + chunkSize)
      socket!.emit(`${SOCKET_ENDPONTS.send}text_chunk`, chunk)
    }

    socket!.emit(`${SOCKET_ENDPONTS.send}text_end`)

    // Now send the image data
    for (let i = 0; i < img.byteLength; i += chunkSize) {
      const chunk = img.slice(i, i + chunkSize)
      socket!.emit(`${SOCKET_ENDPONTS.send}img_chunk`, chunk)
    }

    socket!.emit(`${SOCKET_ENDPONTS.send}img_end`)
  }

  async function comment(params: CommentParams): Promise<void> {
    socket!.emit(SOCKET_ENDPONTS.comment, params)
  }

  return {
    connect,
    login,
    unMatch,
    match,
    disconnect,
    send,
    comment
  }
}
