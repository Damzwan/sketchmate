import { Socket } from 'socket.io-client'
import { socket } from '@/service/api/socket/socket.service'
import { storeToRefs } from 'pinia'
import { PublicLobby, useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useToast } from '@/service/toast.service'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawSyncingAction } from '@/draw/types/drawSyncing.types'
import { SOCKET_ENDPONTS } from '@/types/server.types'
import { createJoinRoomButton } from '@/config/toast.config'

export function registerDrawSyncingHandlers(socket: Socket) {
  socket.on('room-joined', async ({ roomId, users, isCreator }) => {
    const { roomId: rm, roomMembers, isCreator: cr, isTryingToJoin, isLoadingCanvas } = storeToRefs(useDrawSyncer())
    rm.value = roomId
    roomMembers.value = users
    cr.value = isCreator
    isTryingToJoin.value = false
    stopWatchingLobbies()


    if (!isCreator) {
      isLoadingCanvas.value = true
    }
  })

  socket.on('user-joined', ({ user, timestamp, id }) => {
    const { roomMembers, lobbyChatMessages } = storeToRefs(useDrawSyncer())

    if (!roomMembers.value.find(i => i._id === user._id)) {
      roomMembers.value = [...roomMembers.value, user]
    }

    lobbyChatMessages.value.push({
      type: 'join',
      member: user,
      timestamp,
      _id: id
    })
  })

  socket.on('user-left', async ({ user, id, timestamp }) => {
    const { roomMembers, invitedFriends, lobbyChatMessages } = storeToRefs(useDrawSyncer())
    roomMembers.value = roomMembers.value.filter(member => member._id !== user._id)
    invitedFriends.value = invitedFriends.value.filter(m => m !== user._id)

    lobbyChatMessages.value.push({
      type: 'leave',
      member: user,
      timestamp,
      _id: id
    })
  })

  socket.on('join-error', async ({ reason }) => {
    const { isTryingToJoin } = storeToRefs(useDrawSyncer())
    const { toast } = useToast()

    if (reason === 'ROOM_FULL') toast(`Room is full, try again later`, { color: 'danger' })
    else if (reason === 'ROOM_NOT_FOUND') toast(`Room does not exist`, { color: 'danger' })
    else toast(`Unknown error, try again later`, { color: 'danger' })

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

  socket.on(SOCKET_ENDPONTS.friend_invitation, async (data) => {
    const { invitations } = storeToRefs(useDrawSyncer())
    invitations.value.push(data)
    const { toast } = useToast()
    toast(`${data.friend.name} has invited you to draw`, { buttons: [createJoinRoomButton(data.roomId)] })
  })

  socket.on('lobby-message', async ({ message, member, timestamp, id }) => {
    const { lobbyChatMessages } = storeToRefs(useDrawSyncer())
    lobbyChatMessages.value.push({
      type: 'message',
      message,
      member,
      timestamp,
      _id: id
    })

  })

  socket.on('disconnect', () => {
    const store = useDrawSyncer()
    store.disconnectedRoomId = store.roomId
  })

  // this will only trigger after relogging in aka reconnect
  socket.on(SOCKET_ENDPONTS.login, () => {
    const store = useDrawSyncer()
    if (store.disconnectedRoomId) {
      socketJoinRoom({
        roomId: store.disconnectedRoomId,
        intent: store.isCreator ? 'create' : 'join'
      })

      store.disconnectedRoomId = undefined
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
  const { roomId, roomMembers, invitedFriends, isPublicLobby } = storeToRefs(useDrawSyncer())
  if (!roomId.value) return
  roomMembers.value = []
  invitedFriends.value = []
  socket!.emit('leave-room', { roomId: roomId.value })
  roomId.value = undefined
  isPublicLobby.value = false
}

export function emitDrawSyncingEvent(action: DrawSyncingAction) {
  const { roomId } = useDrawSyncer()
  socket!.emit('draw-event', { roomId: roomId, action })
}

export function inviteFriendToRoom(friendId: string, roomId: string) {
  socket!.emit('friend-invite', { roomId, friendId })
}

export function sendLobbyMessage(message: string) {
  const { roomId } = useDrawSyncer()
  socket!.emit('lobby-message', { roomId, message })
}

export function startWatchingLobbies() {
  const { isWatchingPublicLobbies } = storeToRefs(useDrawSyncer())
  isWatchingPublicLobbies.value = true
  socket!.emit('watch-public-lobbies')
  socket!.on('public-lobbies-update', handleLobbyUpdate)
}

function stopWatchingLobbies() {
  const { isWatchingPublicLobbies } = storeToRefs(useDrawSyncer())
  if (!isWatchingPublicLobbies.value) return
  isWatchingPublicLobbies.value = false
  socket!.emit('unwatch-public-lobbies')
  socket!.off('public-lobbies-update', handleLobbyUpdate)
}

function handleLobbyUpdate(lobbies: PublicLobby[]) {
  const { publicLobbies } = storeToRefs(useDrawSyncer())
  publicLobbies.value = lobbies
}

