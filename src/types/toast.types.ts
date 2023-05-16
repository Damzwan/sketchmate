import { COLOR } from '@/types/theme.types'
import { ToastButton } from '@ionic/vue'

export interface ToastOptions {
  color: COLOR
  buttons: ToastButton[]
  duration: number
}

export enum ToastDuration {
  short = 1000,
  medium = 3000,
  long = 5000
}
