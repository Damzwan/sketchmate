import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useShapeCreationStore = defineStore('shapeCreation', () => {
  const shapeCreationSettings = ref({
    stroke: '#000000',
    fill: undefined,
    backgroundColor: undefined,
    strokeWidth: 2
  })

  return { shapeCreationSettings }
})
