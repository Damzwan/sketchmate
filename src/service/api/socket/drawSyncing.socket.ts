import { Socket } from 'socket.io-client'
import { socket } from '@/service/api/socket/socket.service'
import { storeToRefs } from 'pinia'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useToast } from '@/service/toast.service'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawSyncingAction } from '@/draw/types/drawSyncing.types'

export function registerDrawSyncingHandlers(socket: Socket) {
  socket.on('room-joined', async ({ roomId, users, isCreator }) => {
    const { roomId: rm, roomMembers, isCreator: cr, isTryingToJoin, isLoadingCanvas } = storeToRefs(useDrawSyncer())
    rm.value = roomId
    roomMembers.value = users
    cr.value = isCreator
    isTryingToJoin.value = false

    if (!isCreator) {
      isLoadingCanvas.value = true
    }
  })

  socket.on('user-joined', async ({ user }) => {
    const { roomMembers } = storeToRefs(useDrawSyncer())
    const { toast } = useToast()
    toast(`${user.name} joined`)
    roomMembers.value = [...roomMembers.value, user]
  })

  socket.on('user-left', async ({ user }) => {
    const { roomMembers } = storeToRefs(useDrawSyncer())
    const { toast } = useToast()
    toast(`${user.name} left`, { color: 'warning' })
    roomMembers.value = roomMembers.value.filter(member => member._id !== user._id)
  })

  socket.on('join-error', async ({ user }) => {
    const { isTryingToJoin } = storeToRefs(useDrawSyncer())
    const { toast } = useToast()
    toast(`Room does not exist`, { color: 'danger' })
    isTryingToJoin.value = false
  })

  socket.on('request-canvas-state', ({ targetSocketId }) => {
    const { getCanvas } = useDrawStore()
    const json = getCanvas()?.toJSON()

    socket.emit('send-canvas-state', {
      targetSocketId,
      canvasState: json
    })
  })

  socket.on('initial-canvas-state', async ({ canvasState }) => {
    const { loadRoomCanvas } = useDrawSyncer()
    const { isLoadingCanvas } = storeToRefs(useDrawSyncer())

    await loadRoomCanvas(canvasState)
    isLoadingCanvas.value = false
  })

  socket.on('draw-event', async (data) => {
    const { isLoadingCanvas } = storeToRefs(useDrawSyncer())
    const { addToDrawSyncingActionQueue, executeDrawSyncingAction } = useDrawSyncer()

    if (isLoadingCanvas.value) {
      addToDrawSyncingActionQueue(data.action)
    } else {
      await executeDrawSyncingAction(data.action)
    }
  })
}

export function socketJoinRoom({ roomId, intent }: {
  roomId: string
  intent: 'create' | 'join'
}) {
  const { isTryingToJoin } = storeToRefs(useDrawSyncer())
  isTryingToJoin.value = true
  socket!.emit('join-room', { roomId, intent })
}

export function leaveRoom() {
  const { roomId, roomMembers } = storeToRefs(useDrawSyncer())
  roomMembers.value = []
  socket!.emit('leave-room', { roomId: roomId.value })
  roomId.value = undefined
}

export function emitDrawSyncingEvent(action: DrawSyncingAction) {
  const { roomId } = useDrawSyncer()
  socket!.emit('draw-event', { roomId: roomId, action })
}
