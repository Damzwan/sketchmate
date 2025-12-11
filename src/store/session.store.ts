import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSessionStore = defineStore('session', () => {
  const queryParams = ref<URLSearchParams>()
  const installPrompt = ref<any>()
  const updateSlide = ref(false)
  const userDeletedError = ref(false)

  function setQueryParams(params: URLSearchParams | undefined) {
    queryParams.value = params
  }

  function setInstallPrompt(prompt: any) {
    installPrompt.value = prompt
  }

  function setUpdateSlide(value: boolean) {
    updateSlide.value = value
  }

  function setUserDeletedError(value: boolean) {
    userDeletedError.value = value
  }

  return {
    queryParams,
    installPrompt,
    updateSlide,
    userDeletedError,

    setQueryParams,
    setInstallPrompt,
    setUpdateSlide,
    setUserDeletedError
  }
})
