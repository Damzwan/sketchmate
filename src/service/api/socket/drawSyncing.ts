import { Socket } from 'socket.io-client'
import { socket } from '@/service/api/socket/socket.service'
import { storeToRefs } from 'pinia'
import { useDrawSyncer } from '@/draw/store/drawSyncer.store'
import { useToast } from '@/service/toast.service'

export function registerDrawSyncingHandlers(socket: Socket) {
  socket.on('room-joined', async ({ roomId, users, isCreator }) => {
    const { roomId: rm, roomMembers, isCreator: cr, isTryingToJoin } = storeToRefs(useDrawSyncer())
    rm.value = roomId
    roomMembers.value = users
    cr.value = isCreator
    isTryingToJoin.value = false
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
}

export function socketJoinRoom({ roomId, intent }: {
  roomId: string
  intent: 'create' | 'join'
}) {
  socket!.emit('join-room', { roomId, intent })
}

export function leaveRoom() {
  const { roomId, roomMembers } = storeToRefs(useDrawSyncer())
  roomMembers.value = []
  socket!.emit('leave-room', { roomId: roomId.value })
  roomId.value = undefined

}
