import { createGlobalState } from '@vueuse/core'
import { ref } from 'vue'
import { ToastButton } from '@ionic/vue'
import { ToastDuration, ToastOptions } from '@/types/toast.types'

export const useToast = createGlobalState(() => {
  const isOpen = ref(false)
  const color = ref('success')
  const text = ref<string>('')
  const buttons = ref<ToastButton[]>([])
  const duration = ref(2000)
  const position = ref('bottom')

  const defaultOptions: ToastOptions = {
    color: 'success',
    buttons: [],
    duration: ToastDuration.short,
    position: 'bottom'
  }

  function toast(new_text: string, options?: Partial<ToastOptions>): void {
    const mergedOptions: ToastOptions = { ...defaultOptions, ...options }

    isOpen.value = true
    color.value = mergedOptions.color
    text.value = new_text
    duration.value = mergedOptions.duration
    buttons.value = mergedOptions.buttons
    position.value = mergedOptions.position
  }

  function dismiss() {
    isOpen.value = false
  }

  return { isOpen, color, text, duration, toast, dismiss, buttons, position }
})
