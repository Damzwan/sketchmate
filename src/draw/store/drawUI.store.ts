import { defineStore } from 'pinia'
import { FabricEvent, ShapeCreationMode } from '@/draw/types/draw.types'
import { ref } from 'vue'
import { useDrawStore } from '@/draw/store/draw.store'
import * as fabric from 'fabric'
import { Point } from 'fabric'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { useDebounceFn } from '@vueuse/core'

const AVATAR_DISAPPEAR_TIMEOUT_MS = 3000

export const useDrawUIStore = defineStore('drawUI', () => {
  const colorPickerMode = ref(false)
  const addTextMode = ref(false)
  const isEditingText = ref(false)
  const shapeCreationMode = ref<ShapeCreationMode>()
  const isLoading = ref(false)
  const loadingText = ref('')
  const canResetView = ref(false)
  const isMiniMapOpen = ref(false)
  const activeAvatars = ref(new Map())
  const isCanvasNavigating = ref(false)

  const events: FabricEvent[] = [
    {
      on: 'viewport:changed',
      handler: () => {
        handleCanvasNavigation()
      }
    }
  ]

  const resumeRendering = useDebounceFn(() => {
    isCanvasNavigating.value = false
  }, 300)

  function handleCanvasNavigation() {
    isCanvasNavigating.value = true
    setTimeout(() => {
      recalculateAvatarPositions()
    }, 250)
    resumeRendering()
  }

  function showOrUpdateAvatar(userId: string, canvasX: number, canvasY: number) {
    const { getCanvas } = useDrawStore()
    const canvas = getCanvas()

    const canvasPoint = new Point(canvasX, canvasY)
    const screenPoint = canvasPoint.transform(canvas.viewportTransform)

    const { roomMembers } = useDrawSyncer()
    const user = roomMembers.find(member => member._id === userId)
    if (!user) return

    const existing = activeAvatars.value.get(user._id)
    if (existing && existing.timeoutId) {
      clearTimeout(existing.timeoutId)
    }

    activeAvatars.value.set(user._id, {
      ...user,
      canvasX,
      canvasY,
      x: screenPoint.x,
      y: screenPoint.y,
      timeoutId: setTimeout(() => {
        activeAvatars.value.delete(user._id)
      }, AVATAR_DISAPPEAR_TIMEOUT_MS)
    })
  }

  function recalculateAvatarPositions() {
    const { getCanvas } = useDrawStore()
    const canvas = getCanvas()

    activeAvatars.value.forEach((avatar, id) => {
      const canvasPoint = new fabric.Point(avatar.canvasX, avatar.canvasY)
      const screenPoint = canvasPoint.transform(canvas.viewportTransform)

      avatar.x = screenPoint.x
      avatar.y = screenPoint.y
    })
  }

  function init() {
    const { addPermanentEvents } = useDrawEventManager()
    addPermanentEvents(events)
  }


  return {
    colorPickerMode,
    addTextMode,
    isEditingText,
    shapeCreationMode,
    isLoading,
    loadingText,
    canResetView,
    isMiniMapOpen,
    showOrUpdateAvatar,
    recalculateAvatarPositions,
    activeAvatars,
    init,
    isCanvasNavigating
  }
})
