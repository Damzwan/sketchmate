import { modalController, ToastButton, toastController } from '@ionic/vue'
import { useToast } from '@/service/toast.service'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useMenuStore } from '@/store/menu.store'
import { Menu } from '@/draw/types/draw.types'
import { storeToRefs } from 'pinia'
import { socketJoinRoom } from '@/service/api/socket/drawSyncing.socket'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { ToastDuration } from '@/types/toast.types'

const { dismiss } = useToast()

export const dismissButton: ToastButton = {
  text: 'Dismiss',
  handler: () => {
    dismiss()
  }
}

export const matchButton: ToastButton = {
  text: 'Start drawing',
  handler: () => {
    modalController.getTop().then(top => top ? modalController.dismiss() : undefined)
    router.push(FRONTEND_ROUTES.draw)
  },
  cssClass: 'secondary'
}

export const connectButton: ToastButton = {
  text: 'Connect',
  handler: () => {
    modalController.getTop().then(top => top ? modalController.dismiss() : undefined)
    router.push(FRONTEND_ROUTES.connect)
  },
  cssClass: 'secondary'
}

export const balloonButton: ToastButton = {
  text: 'View',
  handler: () => {
    modalController.getTop().then(top => top ? modalController.dismiss() : undefined)
    router.push(FRONTEND_ROUTES.connect)
  },
  cssClass: 'secondary'
}

export const matchBalloonButton: ToastButton = {
  text: 'View',
  handler: () => {
    router.push(FRONTEND_ROUTES.connect)
    const { openMenu } = useMenuStore()
    setTimeout(() => {
      openMenu(Menu.ReceiveBalloon)
    }, 500)
  },
  cssClass: 'secondary'
}

export const viewDrawingButton = (inboxItemId: string): ToastButton => {
  return {
    text: 'View',
    handler: () => {
      router.push({
        path: FRONTEND_ROUTES.gallery,
        query: {
          item: inboxItemId
        }
      })
    }
  }
}

export const viewMateRequestButton = (): ToastButton => {
  return {
    text: 'View',
    handler: () => {
      modalController.getTop().then(top => top ? modalController.dismiss() : undefined)
      router.push({
        path: FRONTEND_ROUTES.connect,
        query: {
          tab: 'request'
        }
      })
    }
  }
}

export const viewCommentButton = (inboxItemId: string): ToastButton => {
  return {
    text: 'View',
    handler: () => {
      router.push({
        path: FRONTEND_ROUTES.gallery,
        query: {
          item: inboxItemId,
          comments: 'true'
        }
      })
    }
  }
}


export const viewSavedButton: ToastButton = {
  text: 'View',
  handler: () => {
    const { openMenu } = useMenuStore()
    const { stickersEmblemsSavedSelectedTab } = storeToRefs(useMenuStore())
    stickersEmblemsSavedSelectedTab.value = 'saved'
    openMenu(Menu.StickerEmblemSaved)
  }
}


export function createJoinRoomButton(code: string): ToastButton {
  return {
    text: 'Join',
    handler: () => {
      const { invitations, roomId } = storeToRefs(useDrawSyncer())

      if (roomId.value) {
        toastController.dismiss().then(() => {
          const { toast } = useToast()
          toast('You are already in a room, leave it first', { color: 'danger', duration: ToastDuration.medium })
        })
        return
      }
      invitations.value = invitations.value.filter(inv => inv.roomId != code)

      socketJoinRoom({ roomId: code, intent: 'join' })
      router.push({
        path: FRONTEND_ROUTES.draw
      })
    }
  }
}

export const joinedRoomButton: ToastButton = {
  text: 'View',
  handler: () => {
    const { openMenu } = useMenuStore()
    openMenu(Menu.DrawRoomMenu)
  }
}
