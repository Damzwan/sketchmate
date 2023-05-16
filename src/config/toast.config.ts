import { ToastButton } from '@ionic/vue'
import { useToast } from '@/service/toast.service'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'

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
    router.push(FRONTEND_ROUTES.draw)
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
