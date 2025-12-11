import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ConnectionStatus, Network } from '@capacitor/network'
import { useToast } from '@/service/toast.service'
import { ToastDuration } from '@/types/toast.types'

export const useNetworkStore = defineStore('network', () => {
  const networkStatus = ref<ConnectionStatus>()

  async function init() {
    networkStatus.value = await Network.getStatus()
    Network.addListener('networkStatusChange', handleNetworkChange)
  }

  function handleNetworkChange(status: ConnectionStatus) {
    const { toast } = useToast()

    if (status.connected && !networkStatus.value?.connected) {
      toast('You are now online', { color: 'success', duration: ToastDuration.long })
    } else if (!status.connected) {
      toast('You are now offline', { color: 'danger', duration: ToastDuration.long })
    }

    networkStatus.value = status
  }

  return {
    networkStatus,
    init
  }
})
