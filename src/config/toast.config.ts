import { modalController, ToastButton } from '@ionic/vue'
import { useToast } from '@/service/toast.service'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useMenuStore } from '@/store/draw/menu.store'
import { Menu } from '@/types/draw.types'
import { storeToRefs } from 'pinia'

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
