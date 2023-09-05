import { COLOR } from '@/types/theme.types'
import { ToastButton } from '@ionic/vue'

export interface ToastOptions {
  color: COLOR
  buttons: ToastButton[]
  duration: number
  position: 'top' | 'bottom' | 'middle'
}

export enum ToastDuration {
  short = 1000,
  medium = 3000,
  long = 5000
}
