import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'
import { Balloon, InboxItem, Mate, SOCKET_ENDPONTS, User } from '@/types/server.types'
import { useAPI } from '@/service/api/api.service'
import { socket, socketLoggedInPromise } from '@/service/api/socket/socket.service'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/service/toast.service'
import { ToastDuration } from '@/types/toast.types'
import { matchBalloonButton } from '@/config/toast.config'
import { getDateOfBirthConfirmationResponse, isOldEnough } from '@/helper/general.helper'
import { useInboxStore } from '@/store/inbox.store'


export const useBalloonStore = defineStore('balloon', () => {
  const sentBalloon = ref<Balloon | null>(null)
  const receivedBalloon = ref<Balloon | null>(null)

  const api = useAPI()
  const auth = useAuthStore()
  const senderInfo = ref<Mate>()

  const { toast } = useToast()


  async function init(user: User) {
    // 1. Recovery: Fetch sent balloon if user has one active
    if (user.balloon?.sent) {
      const res = await api.getBalloon({ balloonId: user.balloon.sent })
      if (res) sentBalloon.value = res
      else {
        api.updateUser({
          _id: user._id,
          balloon: { ...user.balloon, sent: undefined }
        })
        if (auth.user?.balloon) auth.user.balloon.sent = undefined
      }
    }
  }

  function setupSocketListeners() {
    if (!socket) return


    socketLoggedInPromise.then(() => {
      // Calculate Random Timeout (5s to 30s)
      const randomDelay = Math.floor(Math.random() * (30000 - 5000 + 1) + 5000)
      if (auth.isNewAccount) return // too much in case new account
      setTimeout(() => {
        if (!socket || !auth.user?._id || auth.user.balloon?.disabled || receivedBalloon.value) return
        const oldEnough = auth.user.date_of_birth ? isOldEnough(auth.user.date_of_birth) : true
        if (!oldEnough) return
        socket.emit(SOCKET_ENDPONTS.balloon_check, { user_id: auth.user._id })
      }, randomDelay)
    })

    // Triggered by routeBalloonToOnlineUser or triageWaitingRoom
    socket.on(SOCKET_ENDPONTS.receive_new_balloon, async ({ balloon }) => {
      if (balloon) {
        try {
          const mates = await api.getPartialUsers({ _ids: [balloon.sender] })

          if (mates && mates.length > 0) {
            senderInfo.value = mates[0]
            receivedBalloon.value = balloon
          } else {
            console.error('Sender not found')
          }
        } catch (e) {
          console.error('Failed to fetch balloon sender info', e)
        }
      }
    })

    socket.on(SOCKET_ENDPONTS.v2_accept_balloon, async ({ mate, acceptorId, inboxItem }: {
      mate: Mate,
      acceptorId: string,
      inboxItem: InboxItem
    }) => {
      // TODO copied logic from socket service, uglyyy
      auth.user!.mates = [...auth.user!.mates, mate]
      auth.user!.mate_requests_received = auth.user!.mate_requests_received.filter(m => m != mate!._id)
      auth.user!.mate_requests_sent = auth.user!.mate_requests_sent.filter(m => m != mate!._id)

      const { inbox, inboxUsers } = storeToRefs(useInboxStore())
      if (auth.user!.inbox.length != 0 && inbox.value.length == 0) {
        const { getInbox } = useInboxStore()
        await getInbox()
      }

      auth.user!.inbox = [inboxItem._id, ...auth.user!.inbox]
      inbox.value = [inboxItem, ...inbox.value]
      if (!inboxUsers.value.find(m => m._id === mate._id)) {
        inboxUsers.value = [...inboxUsers.value, mate]
      }


      if (acceptorId === auth.user!._id) {
        toast(`You have become mates with ${mate.name}`, {
          buttons: [matchBalloonButton],
          duration: ToastDuration.long
        })
      } else {
        sentBalloon.value = null
        toast(`${mate.name} accepted your balloon`, { buttons: [matchBalloonButton], duration: ToastDuration.long })
      }
    })

    // Targeted dismissal if the timer ran out on server
    socket.on(SOCKET_ENDPONTS.balloon_missed, ({ balloonId }: any) => {
      if (receivedBalloon.value?._id === balloonId) {
        toast('You reacted too late, a new balloon will arrive later', {
          color: 'warning',
          duration: ToastDuration.long
        })
        receivedBalloon.value = null
      }
    })
  }


  async function acceptReceived() {
    if (!receivedBalloon.value || !socket || !auth.user?._id) return

    if (auth.shouldShowDateOfBirthConfirmation) {
      const canSendBalloon = await getDateOfBirthConfirmationResponse()
      if (canSendBalloon == 'cancel' || canSendBalloon == 'notAllowed') {
        refuseReceived()
        return
      }
    }


    socket.emit(SOCKET_ENDPONTS.v2_accept_balloon, {
      balloon_id: receivedBalloon.value._id,
      sender_id: receivedBalloon.value.sender,
      user_id: auth.user._id
    })

    // Optimistically clear so the UI closes immediately
    receivedBalloon.value = null
  }

  function refuseReceived() {
    if (!receivedBalloon.value || !socket || !auth.user?._id) return

    socket.emit(SOCKET_ENDPONTS.v2_refuse_balloon, {
      balloon_id: receivedBalloon.value._id,
      sender_id: receivedBalloon.value.sender,
      user_id: auth.user._id
    })

    receivedBalloon.value = null
  }

  async function disableBalloons() {
    if (!receivedBalloon.value || !socket || !auth.user?._id) return

    socket.emit(SOCKET_ENDPONTS.v2_refuse_balloon, {
      balloon_id: receivedBalloon.value._id,
      sender_id: receivedBalloon.value.sender,
      user_id: auth.user._id,
      disable: true
    })

    receivedBalloon.value = null
    auth.user.balloon!.disabled = true
  }

  function cancelSent() {
    if (!sentBalloon.value || !socket || !auth.user?._id) return

    socket.emit(SOCKET_ENDPONTS.v2_cancel_balloon, {
      balloon_id: sentBalloon.value._id,
      user_id: auth.user._id
    })

    sentBalloon.value = null
  }


  return {
    sentBalloon,
    receivedBalloon,
    init,
    acceptReceived,
    refuseReceived,
    cancelSent,
    setupSocketListeners,
    disableBalloons,
    senderInfo
  }
})