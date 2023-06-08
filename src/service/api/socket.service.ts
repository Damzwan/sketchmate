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
import { UseIonRouterResult } from '@ionic/vue'
import router from '@/router'
import { dismissButton, matchButton, viewCommentButton, viewDrawingButton } from '@/config/toast.config'
import { ToastDuration } from '@/types/toast.types'
import pako from 'pako'
import { EventBus } from '@/main'

let socket: Socket | undefined

export interface ExpandedSocketAPI extends SocketAPI {
  provideRouter(router: UseIonRouterResult): void
}

let socketServiceInstance: ExpandedSocketAPI | null = null

export function useSocketService(): ExpandedSocketAPI {
  if (!socketServiceInstance) socketServiceInstance = createSocketService()
  return socketServiceInstance
}

export function createSocketService(): ExpandedSocketAPI {
  const { increaseUnreadMessages, addComment } = useAppStore()
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
        router.push(FRONTEND_ROUTES.mate)
      } else toast('Failed to connect to mate', { color: 'error' })
    })

    socket.on(SOCKET_ENDPONTS.unmatch, (success: boolean) => {
      if (success) {
        toast('Unmatched', { color: 'warning' })
        user.value!.mate = undefined
        inbox.value = []
        user.value!.inbox = []
        router.push(FRONTEND_ROUTES.connect)
      } else toast('Failed to unmatch', { color: 'error' })
      isLoading.value = false
    })

    socket.on(SOCKET_ENDPONTS.send, (params: Res<InboxItem>) => {
      isLoading.value = false
      if (params) {
        user.value?.inbox.push(params._id)
        inbox.value?.push(params)
        const text = params.sender === user.value!._id ? 'Drawing sent!' : 'New drawing received'
        toast(text, {
          buttons: [viewDrawingButton(params._id)],
          duration: ToastDuration.medium
        })
        if (params.sender !== user.value?._id) increaseUnreadMessages()
        EventBus.emit('reset-canvas')
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
    isLoading.value = true
    const encoder = new TextEncoder() // Use TextEncoder to convert string to Uint8Array
    const data = JSON.stringify(params)
    const compressedData = pako.deflate(encoder.encode(data))

    const chunkSize = 1024 // or whatever size you prefer

    for (let i = 0; i < compressedData.length; i += chunkSize) {
      const chunk = compressedData.slice(i, i + chunkSize)
      socket!.emit(`${SOCKET_ENDPONTS.send}chunk`, chunk)
    }

    socket!.emit(`${SOCKET_ENDPONTS.send}end`)
  }

  async function comment(params: CommentParams): Promise<void> {
    socket!.emit(SOCKET_ENDPONTS.comment, params)
  }

  function provideRouter(new_router: UseIonRouterResult) {
    // router.value = new_router
  }

  return {
    connect,
    login,
    unMatch,
    match,
    disconnect,
    send,
    provideRouter,
    comment
  }
}