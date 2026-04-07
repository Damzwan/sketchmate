import { defineStore } from 'pinia'
import { ShapeCreationMode } from '@/draw/types/draw.types'
import { ref } from 'vue'

export const useDrawUIStore = defineStore('drawUI', () => {
  const colorPickerMode = ref(false)
  const addTextMode = ref(false)
  const isEditingText = ref(false)
  const shapeCreationMode = ref<ShapeCreationMode>()
  const isLoading = ref(false)
  const loadingText = ref('')
  const canResetView = ref(false)
  const isMiniMapOpen = ref(false)

  return {
    colorPickerMode,
    addTextMode,
    isEditingText,
    shapeCreationMode,
    isLoading,
    loadingText,
    canResetView,
    isMiniMapOpen
  }
})
