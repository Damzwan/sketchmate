import { defineStore } from 'pinia'
import { DrawTool, PenMenuTool, SelectTool } from '@/draw/types/draw.types'
import { PENMENUTOOLS, SELECTMENUTOOLS } from '@/draw/config/tools.config'
import { useMenuStore } from '@/store/menu.store'
import { createToolsMapping } from '@/draw/helpers/tools/tools.helper'
import { useDrawEventManager } from '../drawEventManager.store'
import { ref, watch } from 'vue'
import { Canvas } from 'fabric'

export const useToolSelectionStore = defineStore('toolSelection', () => {
  const selectedTool = ref(DrawTool.MobileEraser)
  const lastSelectedPenMenuTool = ref<PenMenuTool>(DrawTool.Pen)
  const lastSelectedSelectTool = ref<SelectTool>(DrawTool.Select)

  const { openToolMenu } = useMenuStore()
  const drawEventManager = useDrawEventManager()
  const toolsMapping = createToolsMapping()

  function init(c: Canvas) {
    for (const [, tool] of Object.entries(toolsMapping)) {
      tool.init(c)
    }
  }

  function selectTool(newTool: DrawTool, options?: any) {
    if (selectedTool.value === newTool && !options?.skipOpenMenu) {
      openToolMenu(newTool, options?.e)
      return
    }

    selectedTool.value = newTool
    toolsMapping[newTool].select()
    drawEventManager.switchToolEvents(toolsMapping[newTool])
  }

  watch(selectedTool, () => {
    if (PENMENUTOOLS.includes(selectedTool.value)) {
      lastSelectedPenMenuTool.value = selectedTool.value as PenMenuTool
    } else if (SELECTMENUTOOLS.includes(selectedTool.value)) {
      lastSelectedSelectTool.value = selectedTool.value as SelectTool
    }
  })

  return {
    selectedTool,
    lastSelectedPenMenuTool,
    lastSelectedSelectTool,
    selectTool,
    init
  }
})
