import { onMounted, onUnmounted } from 'vue'
import { App } from '@capacitor/app'
import { PluginListenerHandle } from '@capacitor/core'
import { useAuthStore } from '@/store/auth.store'

export function useActiveViewSync() {
  const authStore = useAuthStore()
  let stateListener: PluginListenerHandle | null = null

  const handleStateChange = async ({ isActive }: { isActive: boolean }) => {
    if (isActive && authStore.refreshNeeded) {
      authStore.refreshNeeded = false
      try {
        await authStore.refresh()
      } catch (error) {
        console.error('Failed to refresh auth session:', error)
      }
    }
  }

  onMounted(async () => {
    stateListener = await App.addListener('appStateChange', handleStateChange)
  })

  onUnmounted(() => {
    if (stateListener) {
      stateListener.remove()
    }
  })
}