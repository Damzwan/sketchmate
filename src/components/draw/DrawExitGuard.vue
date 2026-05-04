<script setup lang="ts">
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { modalController, useBackButton } from '@ionic/vue'
import { useDrawLoadStore } from '@/draw/store/drawLoad.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import DrawExitModal from '@/components/draw/DrawExitModal.vue'

const props = defineProps<{
  draftId: string
  isLobby: boolean
}>()

const router = useRouter()
const loadStore = useDrawLoadStore()

let isNavigationConfirmed = false

const showExitUI = async (): Promise<boolean> => {
  if (!loadStore.hasContent() && !props.isLobby) {
    return true
  }

  // 2. OPEN DYNAMIC MODAL
  const modal = await modalController.create({
    component: DrawExitModal,
    componentProps: {
      isLobby: props.isLobby
    },
    cssClass: 'draw-exit-modal',
    breakpoints: [0, 1],
    initialBreakpoint: 1,
    handle: true,
    canDismiss: true,
    backdropDismiss: true
  })

  await modal.present()

  const { role } = await modal.onWillDismiss()

  // 3. LOGIC HANDLERS
  switch (role) {
    case 'save':
      await loadStore.forceSave()
      return true

    case 'leave':
    case 'discard':
      if (!props.isLobby) {
        await loadStore.removeDraft(props.draftId)
      }
      return true

    case 'cancel':
    default:
      // User backed out or swiped the modal away
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

useBackButton(10, async () => {
  const shouldLeave = await showExitUI()
  if (shouldLeave) {
    isNavigationConfirmed = true
    loadStore.stopAutosave()
    router.back()
  }
})
</script>

<template>
  <div style="display: none" />
</template>