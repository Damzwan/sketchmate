<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { modalController, useBackButton, useIonRouter } from '@ionic/vue'
import { useDrawLoadStore } from '@/draw/store/drawLoad.store'
import DrawExitModal from '@/components/draw/DrawExitModal.vue'
import { ref } from 'vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { slideTransition } from '@/helper/animation.helper' // Assuming you have your routes here

const props = defineProps<{
  draftId: string
  isLobby: boolean
}>()

const router = useIonRouter()
const loadStore = useDrawLoadStore()

let isNavigationConfirmed = false
const isExiting = ref(false)


const executeExitNavigation = () => {
  isNavigationConfirmed = true
  loadStore.stopAutosave()

  if (router.canGoBack()) {
    router.back()
  } else {
    router.replace(FRONTEND_ROUTES.home, slideTransition)
  }
}

const showExitUI = async (): Promise<boolean> => {
  if (isExiting.value) return false

  // If canvas is empty and not a lobby, just let them leave
  if (!loadStore.hasContent() && !props.isLobby) {
    return true
  }

  isExiting.value = true

  const modal = await modalController.create({
    component: DrawExitModal,
    componentProps: { isLobby: props.isLobby },
    cssClass: 'draw-exit-modal',
    breakpoints: [0, 1],
    initialBreakpoint: 1
  })

  await modal.present()
  const { role } = await modal.onWillDismiss()
  isExiting.value = false

  switch (role) {
    case 'save':
      await loadStore.forceSave()
      return true
    case 'leave':
    case 'discard':
      if (!props.isLobby) await loadStore.removeDraft(props.draftId)
      return true
    default:
      return false
  }
}


onBeforeRouteLeave(async (to, from, next) => {
  if (isNavigationConfirmed) return next()

  const shouldLeave = await showExitUI()
  if (shouldLeave) {
    isNavigationConfirmed = true
    loadStore.stopAutosave()
    next()
  } else {
    next(false)
  }
})


useBackButton(1, async () => {
  if (isNavigationConfirmed) return

  const shouldLeave = await showExitUI()
  if (shouldLeave) {
    executeExitNavigation()
  }
})
</script>