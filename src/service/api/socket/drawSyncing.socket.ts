import { Socket } from 'socket.io-client'
import { socket } from '@/service/api/socket/socket.service'
import { storeToRefs } from 'pinia'
import { PublicLobby, useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useToast } from '@/service/toast.service'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawSyncingAction } from '@/draw/types/drawSyncing.types'
import { SOCKET_ENDPONTS } from '@/types/server.types'
import { createJoinRoomButton } from '@/config/toast.config'
import router from '@/router'
import { ToastDuration } from '@/types/toast.types'
import { getDateOfBirthConfirmationResponse } from '@/helper/general.helper'
import { useAuthStore } from '@/store/auth.store'

export function registerDrawSyncingHandlers(socket: Socket) {
  socket.on('room-joined', async ({ roomId, users, isCreator }) => {
    const { roomId: rm, roomMembers, isCreator: cr, isTryingToJoin, isLoadingCanvas } = storeToRefs(useDrawSyncer())
    rm.value = roomId
    roomMembers.value = users
    cr.value = isCreator
    isTryingToJoin.value = false
    stopWatchingLobbies()
    addRoomIdToUrl(roomId)


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
    const { toast } = useToast()

    if (reason === 'ROOM_FULL') toast(`Room is full, try again later`, { color: 'danger' })
    else if (reason === 'ROOM_NOT_FOUND') {
      removeRoomIdFromUrl()
      toast(`Room does not exist`, { color: 'danger' })
    } else if (reason === 'DOUBLE_JOIN') {
      toast('Joined from another device', { color: 'danger' })
    } else toast(`Unknown error, try again later`, { color: 'danger' })

    leaveRoom(true)
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
    invitations.value = invitations.value.filter(inv => inv.friend._id === data.friend.id)
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

export function leaveRoom(skipEmit = false) {
  const { roomId, roomMembers, invitedFriends, isPublicLobby, isLoadingCanvas } = storeToRefs(useDrawSyncer())
  if (!roomId.value) return
  roomMembers.value = []
  invitedFriends.value = []
  removeRoomIdFromUrl()
  isPublicLobby.value = false
  isLoadingCanvas.value = false

  if (!skipEmit) socket!.emit('leave-room', { roomId: roomId.value })
  roomId.value = undefined
}

export function emitDrawSyncingEvent(action: DrawSyncingAction) {
  const { roomId } = useDrawSyncer()

  const json = JSON.stringify(action)
  const sizeBytes = new Blob([json]).size
  const sizeMB = sizeBytes / (1024 * 1024)

  // console.log(`Action size: ${sizeMB.toFixed(4)} MB`)

  if (sizeMB >= 0.6) {
    const { toast } = useToast()
    toast('Kicked out of lobby, operation too big', { color: 'danger', duration: ToastDuration.long })
    leaveRoom()
    return
  }

  console.log('sending')


  socket!.emit('draw-event', { roomId: roomId, action })
}

export function inviteFriendToRoom(friendId: string, roomId: string) {
  socket!.emit('friend-invite', { roomId, friendId })
}

export function sendLobbyMessage(message: string) {
  const { roomId } = useDrawSyncer()
  socket!.emit('lobby-message', { roomId, message })
}

export async function startWatchingLobbies() {
  const { shouldShowDateOfBirthConfirmation } = useAuthStore()
  if (shouldShowDateOfBirthConfirmation) {
    const socialFeatureResult = await getDateOfBirthConfirmationResponse()
    if (socialFeatureResult == 'cancel' || socialFeatureResult == 'notAllowed') {
      return
    }
  }

  const { isWatchingPublicLobbies } = storeToRefs(useDrawSyncer())
  isWatchingPublicLobbies.value = true
  socket!.emit('watch-public-lobbies')
  socket!.on('public-lobbies-update', handleLobbyUpdate)
}

export function stopWatchingLobbies() {
  const { isWatchingPublicLobbies, publicLobbies } = storeToRefs(useDrawSyncer())
  if (!isWatchingPublicLobbies.value) return
  isWatchingPublicLobbies.value = false
  publicLobbies.value = []
  socket!.emit('unwatch-public-lobbies')
  socket!.off('public-lobbies-update', handleLobbyUpdate)
}

function handleLobbyUpdate(lobbies: PublicLobby[]) {
  const { publicLobbies } = storeToRefs(useDrawSyncer())
  publicLobbies.value = lobbies
}

function removeRoomIdFromUrl() {
  const query = { ...router.currentRoute.value.query }
  delete query.room_id
  router.replace({ query })
}

function addRoomIdToUrl(roomId: string) {
  const query = {
    ...router.currentRoute.value.query,
    room_id: roomId
  }

  router.replace({ query })
}
