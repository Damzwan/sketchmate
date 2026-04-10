import { io, Socket } from 'socket.io-client'
import {
  AcceptBalloonParams,
  CancelBalloonParams,
  CommentParams,
  CommentRes,
  InboxItem,
  MatchParams,
  MatchRes,
  Mate,
  Res,
  SendMateRequestParams,
  SendParams,
  SOCKET_ENDPONTS,
  SocketAPI,
  SocketLoginParams,
  UnMatchParams
} from '@/types/server.types'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { useToast } from '@/service/toast.service'
import { dismissButton, matchButton, viewDrawingButton, viewMateRequestButton } from '@/config/toast.config'
import { ToastDuration } from '@/types/toast.types'
import { useAPI } from '@/service/api/api.service'
import { showFeedbackMilestones } from '@/config/general.config'
import { useMenuStore } from '@/store/menu.store'
import { Menu } from '@/draw/types/draw.types'
import { useInboxStore } from '@/store/inbox.store'
import { useSessionStore } from '@/store/session.store'
import { useBalloonStore } from '@/store/balloon.store'
import { useFriendStore } from '@/store/friend.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { registerDrawSyncingHandlers } from '@/service/api/socket/drawSyncing.socket'

export let socket: Socket | undefined

let socketServiceInstance: SocketAPI | null = null
let resolveSocketLoggedIn: () => void
export let socketLoggedInPromise = new Promise<void>((resolve) => {
  resolveSocketLoggedIn = resolve
})

export function useSocketService(): SocketAPI {
  if (!socketServiceInstance) socketServiceInstance = createSocketService()
  return socketServiceInstance
}

export function createSocketService(): SocketAPI {
  const { addComment } = useInboxStore()
  const {
    user,
    isLoading,
    isLoggedIn
  } = storeToRefs(useAuthStore())
  const { inbox } = storeToRefs(useInboxStore())
  const { friendRequestUsers, friendRequestLoading } = storeToRefs(useFriendStore())
  const { toast } = useToast()

  async function connect(): Promise<void> {
    if (socket) return
    socket = io(import.meta.env.VITE_BACKEND as string, {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      query: {
        clientVersion: '2'
      }
    })

    registerDrawSyncingHandlers(socket)
    const { setupSocketListeners } = useBalloonStore()
    setupSocketListeners()

    socket.io.on('reconnect', () => {
      if (!user.value?._id) return
      login({ _id: user.value._id })
    })

    socket.on('disconnect', () => {
      const store = useAuthStore()
      store.refreshNeeded = true
    })


    socket.on(SOCKET_ENDPONTS.login, () => {
      resolveSocketLoggedIn?.()
    })


    socket.on(SOCKET_ENDPONTS.match, (params: Res<MatchRes>) => {
      isLoading.value = false
      friendRequestLoading.value = false
      if (!params) return
      if (params.mate && params.mate._id != user.value?._id) {
        user.value!.mates = [...user.value!.mates, params.mate]
        user.value!.mate_requests_received = user.value!.mate_requests_received.filter(m => m != params.mate!._id)
        user.value!.mate_requests_sent = user.value!.mate_requests_sent.filter(m => m != params.mate!._id)
        toast(`Matched to ${params.mate.name}`, { buttons: [matchButton, dismissButton], duration: 5000 })
      } else {
        toast(`Failed to connect: ${params.error}`, { color: 'danger', duration: ToastDuration.long })
      }
    })

    socket.on(SOCKET_ENDPONTS.unmatch, async ({ unMatchedMateID, gotUnMatched }) => {
      if (!isLoggedIn.value) return
      isLoading.value = false

      const unMatchedMate = user.value!.mates.find(u => u._id == unMatchedMateID)
      if (gotUnMatched) {
        toast(`${unMatchedMate?.name} unmatched you`, {
          buttons: [dismissButton],
          duration: 5000,
          color: 'warning'
        })
      } else {
        toast(`Unmatched ${unMatchedMate?.name}`, {
          buttons: [dismissButton],
          duration: 5000,
          color: 'warning'
        })
      }

      user.value!.mates = user.value!.mates.filter(el => el._id != unMatchedMate!._id)
    })

    socket.on(SOCKET_ENDPONTS.send, async (params: Res<InboxItem>) => {
      isLoading.value = false
      if (params) {
        const { inboxUsers } = storeToRefs(useInboxStore())
        const { updateSlide } = storeToRefs(useSessionStore())

        updateSlide.value = true
        if (user.value!.inbox.length != 0 && inbox.value.length == 0) {
          const { getInbox } = useInboxStore()
          await getInbox()
        }

        user.value!.inbox = [params._id, ...user.value!.inbox]
        inbox.value = [params, ...inbox.value]


        const followersNotInInboxUsers = params.original_followers.reduce((acc: string[], curr) => !inboxUsers.value.some(m => m._id == curr) ? [...acc, curr] : acc, [])
        if (followersNotInInboxUsers.length > 0) {
          const { getPartialUsers } = useAPI()
          getPartialUsers({ _ids: followersNotInInboxUsers }).then(res => {
            if (res) inboxUsers.value = [...inboxUsers.value, ...res]
          })
        }

        if (params.sender === user.value?._id) {
          const { isSendingDrawing } = storeToRefs(useDrawStore())
          isSendingDrawing.value = false
          const sentDrawingsCount = inbox.value.reduce((acc: number, curr) =>
              acc + (curr.sender == user.value!._id ? 1 : 0),
            0)
          if (showFeedbackMilestones.includes(sentDrawingsCount)) {
            const { openMenu } = useMenuStore()
            openMenu(Menu.FeedbackMenu)
          }
        }


        const text = params.sender === user.value!._id ? 'Drawing sent!' : 'New drawing received'
        toast(text, {
          buttons: [dismissButton, viewDrawingButton(params._id)],
          duration: ToastDuration.long
        })
      }
    })

    socket.on(SOCKET_ENDPONTS.comment, (params: Res<CommentRes>) => {
      if (params) {
        addComment(params)
      }
    })

    socket.on(SOCKET_ENDPONTS.mate_request, async (params: SendMateRequestParams) => {
      friendRequestLoading.value = false
      if (params.sender == user.value!._id) {
        toast('Request sent')
        user.value!.mate_requests_sent.push(params.receiver)
      } else {
        user.value!.mate_requests_received.push(params.sender)

        const { getPartialUsers } = useAPI()

        const newFriendRequestUser = await getPartialUsers({ _ids: [params.sender] }) as Mate[]
        friendRequestUsers.value = [...friendRequestUsers.value, ...newFriendRequestUser]


        toast(`${params.sender_name} wants to become your friend`, {
          buttons: [dismissButton, viewMateRequestButton()],
          duration: ToastDuration.long
        })
      }
    })


    socket.on(SOCKET_ENDPONTS.cancel_mate_request, (params: SendMateRequestParams) => {
      friendRequestLoading.value = false

      if (params.sender == user.value!._id) {
        toast('Friend request cancelled')
        user.value!.mate_requests_sent = user.value!.mate_requests_sent.filter(m => m != params.receiver)
      } else {
        user.value!.mate_requests_received = user.value!.mate_requests_received.filter(m => m != params.sender)
      }
    })

    socket.on(SOCKET_ENDPONTS.refuse_mate_request, (params: SendMateRequestParams) => {
      friendRequestLoading.value = false
      if (params.sender == user.value!._id) {
        toast('Friend request declined')
        user.value!.mate_requests_received = user.value!.mate_requests_received.filter(m => m != params.receiver)
      } else {
        user.value!.mate_requests_sent = user.value!.mate_requests_sent.filter(m => m != params.sender)
      }
    })


  }

  async function disconnect(): Promise<void> {
    socket!.disconnect()
    socket = undefined
  }

  async function login(params: SocketLoginParams): Promise<void> {
    socket!.emit(SOCKET_ENDPONTS.login, {...params, version: __APP_VERSION__})
  }


  async function match(params: MatchParams): Promise<void> {
    await socketLoggedInPromise // make sure the user Id to socket mapping in the backend exists
    isLoading.value = true
    socket!.emit(SOCKET_ENDPONTS.match, params)
  }

  async function unMatch(params: UnMatchParams): Promise<void> {
    isLoading.value = true
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

    // send the text data
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

  async function sendMateRequest(params: SendMateRequestParams): Promise<void> {
    const { friendRequestLoading } = storeToRefs(useFriendStore())
    friendRequestLoading.value = true
    socket!.emit(SOCKET_ENDPONTS.mate_request, params)
  }

  async function cancelSendMateRequest(params: SendMateRequestParams): Promise<void> {
    const { friendRequestLoading } = storeToRefs(useFriendStore())
    friendRequestLoading.value = true
    socket!.emit(SOCKET_ENDPONTS.cancel_mate_request, params)
  }

  async function refuseSendMateRequest(params: SendMateRequestParams): Promise<void> {
    const { friendRequestLoading } = storeToRefs(useFriendStore())
    friendRequestLoading.value = true
    socket!.emit(SOCKET_ENDPONTS.refuse_mate_request, params)
  }


  return {
    connect,
    login,
    unMatch,
    match,
    disconnect,
    send,
    comment,
    sendMateRequest,
    cancelSendMateRequest,
    refuseSendMateRequest
  }
}
