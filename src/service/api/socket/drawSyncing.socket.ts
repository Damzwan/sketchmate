import { Socket } from 'socket.io-client'
import { socket } from '@/service/api/socket/socket.service'
import { storeToRefs } from 'pinia'
import { LobbyChatItem, PublicLobby, useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useToast } from '@/service/toast.service'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawSyncingAction } from '@/draw/types/drawSyncing.types'
import { SOCKET_ENDPONTS } from '@/types/server.types'
import { createJoinRoomButton } from '@/config/toast.config'
import router from '@/router'
import { ToastDuration } from '@/types/toast.types'
import { getDateOfBirthConfirmationResponse } from '@/helper/general.helper'
import { useAuthStore } from '@/store/auth.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'

export function registerDrawSyncingHandlers(socket: Socket) {
  socket.on('room-joined', async ({ roomId, users, isCreator, sessionId }) => {
    const { roomId: rm, roomMembers, isCreator: cr, isTryingToJoin, currentSessionId } = storeToRefs(useDrawSyncer())
    rm.value = roomId
    roomMembers.value = users
    cr.value = isCreator
    isTryingToJoin.value = false
    currentSessionId.value = sessionId
    stopWatchingLobbies()
    addRoomIdToUrl(roomId)
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

  socket.on('join-error', async ({ reason, message }) => {
    const { toast } = useToast()

    // 1. Handle predefined technical codes
    if (reason === 'ROOM_FULL') {
      toast(`Room is full, try again later`, { color: 'danger' })
    } else if (reason === 'ROOM_NOT_FOUND') {
      removeRoomIdFromUrl()
      toast(`Room does not exist`, { color: 'danger' })
    } else if (reason === 'DOUBLE_JOIN') {
      toast('Joined from another device', { color: 'danger' })
    } else if (reason && message) {
      toast(message, { color: 'danger', duration: ToastDuration.long })
    } else {
      toast(`Unknown error: ${reason || 'Connection failed'}`, { color: 'danger' })
    }

    leaveRoom(true)
  })

  socket.on('request-canvas-state', ({ targetSocketId, snapshotSequenceId, isBackgroundUpdate }) => {
    const { getCanvas } = useDrawStore()
    const canvas = getCanvas()
    if (!canvas) return

    // Note: If you ever notice a slight stutter when this runs in the background,
    // it's because JSON.stringify on a massive canvas is synchronous.
    // For now, it will work perfectly.
    const canvasString = JSON.stringify(canvas.toJSON())
    const sizeKB = canvasString.length / 1024

    socket.emit('send-canvas-state', {
      targetSocketId,
      canvasState: canvasString,
      sizeKB: Math.round(sizeKB),
      snapshotSequenceId, // <-- Return the timestamp to the server
      isBackgroundUpdate  // <-- Tell the server this was a background sync
    })
  })

  socket.on('initial-canvas-state', async ({ canvasState, sequenceId, missedActions, isInitialSync }) => {
    const store = useDrawSyncer()
    const { isLoadingCanvas, lastProcessedSequenceId } = storeToRefs(store)

    // Set our baseline time
    if (sequenceId !== undefined) {
      lastProcessedSequenceId.value = sequenceId
    }

    const json = JSON.parse(canvasState)
    await store.loadRoomCanvas(json, isInitialSync)

    // Process any actions that occurred while the snapshot was uploading

    if (missedActions && missedActions.length > 0) {
      for (const item of missedActions) {
        lastProcessedSequenceId.value = item.sequenceId
        await store.executeDrawSyncingAction(item)
      }
    }

    isLoadingCanvas.value = false
  })

  socket.on('missed-actions', async ({ actions, isInitialSync }) => {
    const store = useDrawSyncer()
    const { isLoadingCanvas, lastProcessedSequenceId } = storeToRefs(store)

    if (isInitialSync) {
      const { reset } = useDrawStore()
      reset(false)
    }


    for (const item of actions) {
      lastProcessedSequenceId.value = item.sequenceId
      await store.executeDrawSyncingAction(item)
    }

    isLoadingCanvas.value = false
  })

  socket.on('draw-event', async (data) => {
    const store = useDrawSyncer()
    const { isLoadingCanvas, lastProcessedSequenceId } = storeToRefs(store)

    // Update our local time tracker
    if (data.sequenceId !== undefined) {
      lastProcessedSequenceId.value = data.sequenceId
    }

    // Kind of hacky but that way i do not need to rewrite the signature of the functions
    if (data.action.params) {
      data.action.params.creator = data.creator
    }

    if (isLoadingCanvas.value) {
      store.addToDrawSyncingActionQueue(data.action)
    } else {
      await store.executeDrawSyncingAction(data.action)
    }
  })

  socket.on(SOCKET_ENDPONTS.friend_invitation, async (data) => {
    const { invitations } = storeToRefs(useDrawSyncer())
    invitations.value = invitations.value.filter(inv => inv.friend._id === data.friend.id)
    invitations.value.push(data)
    const { toast } = useToast()
    toast(`${data.friend.name} has invited you to draw`, {
      buttons: [createJoinRoomButton(data.roomId)],
      duration: ToastDuration.long
    })
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

  socket.on('missed-lobby-messages', (missedMessages: LobbyChatItem[]) => {
    const { lobbyChatMessages } = storeToRefs(useDrawSyncer())
    lobbyChatMessages.value.push(...missedMessages)
    lobbyChatMessages.value.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
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
  const { isTryingToJoin, lastProcessedSequenceId, isLoadingCanvas, currentSessionId } = storeToRefs(useDrawSyncer())
  isTryingToJoin.value = true

  if (intent === 'join') {
    isLoadingCanvas.value = true
  }

  const { stopSaving } = useDrawStore()
  stopSaving()


  socket!.emit('join-room', {
    roomId,
    intent,
    lastSequenceId: lastProcessedSequenceId.value,
    lastSessionId: currentSessionId.value
  })
}

// TODO maybe move to the story?
export function leaveRoom(skipEmit = false) {
  const {
    roomId,
    roomMembers,
    invitedFriends,
    isPublicLobby,
    isLoadingCanvas,
    lobbyChatMessages,
    lastProcessedSequenceId // <-- Added this
  } = storeToRefs(useDrawSyncer())


  roomMembers.value = []
  invitedFriends.value = []
  removeRoomIdFromUrl()
  isPublicLobby.value = false
  isLoadingCanvas.value = false
  lobbyChatMessages.value = []
  lastProcessedSequenceId.value = undefined // <-- Reset time on leave

  if (!skipEmit) socket!.emit('leave-room', { roomId: roomId.value })
  roomId.value = undefined

  const { restoreLocalCanvas, startSaving, getCanvas } = useDrawStore()
  restoreLocalCanvas().then(() => startSaving(getCanvas()))
}

export function emitDrawSyncingEvent(action: DrawSyncingAction) {
  const { roomId } = useDrawSyncer()

  const json = JSON.stringify(action)
  const sizeBytes = new Blob([json]).size
  const sizeMB = sizeBytes / (1024 * 1024)

  console.log(`Action size: ${sizeMB.toFixed(4)} MB`)
  if (sizeMB >= 0.6) {
    const { toast } = useToast()
    toast('Operation too big, cancelled', { color: 'danger', duration: ToastDuration.long })
    const { silentUndo, silentRedo, lastActionType } = useDrawHistoryManager()

    if (lastActionType === 'redo' || lastActionType === 'normal') {
      silentUndo()
    } else silentRedo()

    return
  }


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
