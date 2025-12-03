import { defineStore } from 'pinia'
import { type Canvas, type FabricObject } from 'fabric'
import { type Ref, ref } from 'vue'
import { v4 } from 'uuid'
import { enableSelection } from '@/helper/draw/select.helper'
import { FabricEvent, ToolService } from '@/types/draw.types'


interface Select extends ToolService {
  unSelect: () => void
  getSelectedObjects: () => FabricObject[]
  isSelectActive: Ref<boolean>
  selectedObjectsRef: Ref<FabricObject[]>
  multiSelectMode: Ref<boolean>
}

export const useSelect = defineStore('select', (): Select => {
  let c: Canvas | undefined = undefined
  const isSelectActive = ref(false)

  let selectedObjects: FabricObject[] = []
  const selectedObjectsRef: Ref<FabricObject[]> = ref([])

  const multiSelectMode = ref(false)
  let clicksAfterSelectionActive = 0

  const events: FabricEvent[] = [
    {
      on: 'selection:created',
      handler: (e: any) => {
        if (c!._activeObject && c!._activeObject.isType('activeselection')) c!._activeObject.id = v4() // used in history
        isSelectActive.value = true
        clicksAfterSelectionActive = 0
        selectedObjects = e.selected
        selectedObjectsRef.value = selectedObjects
      }
    },
    {
      on: 'selection:updated',
      handler: (e: any) => {
        selectedObjects = e.selected
        selectedObjectsRef.value = selectedObjects
        clicksAfterSelectionActive = 0
      }
    },
    {
      on: 'selection:cleared',
      handler: () => {
        isSelectActive.value = false
        selectedObjects = []
        selectedObjectsRef.value = selectedObjects
      }
    },
    {
      on: 'mouse:down',
      handler: () => {
        clicksAfterSelectionActive++
        if (!isSelectActive.value || clicksAfterSelectionActive <= 1) return
        console.log('write logic')
      }
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
  }

  async function select() {
    c!.isDrawingMode = false
    c!.selection = true
    enableSelection()
    c!.requestRenderAll()
  }

  function unSelect() {
    c!.discardActiveObject()
    c!.requestRenderAll()
    isSelectActive.value = false
  }

  function getSelectedObjects() {
    return selectedObjects
  }

  return {
    select,
    init,
    events,
    unSelect,
    isSelectActive,
    getSelectedObjects,
    selectedObjectsRef,
    multiSelectMode
  }
})
