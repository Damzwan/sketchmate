import { defineStore } from 'pinia'
import { Ref, ref } from 'vue'
import { DrawTool, Menu } from '@/types/draw.types'

export const useMenuStore = defineStore('menu', () => {
  const penMenuOpen = ref(false)
  const eraserMenuOpen = ref(false)
  const stickerMenuOpen = ref(false)
  const savedMenuOpen = ref(false)
  const shapesMenuOpen = ref(false)

  const menuEvent = ref<Event>()

  const menuMapping: { [key in Menu]: Ref<boolean> } = {
    [Menu.Pen]: penMenuOpen,
    [Menu.Eraser]: eraserMenuOpen,
    [Menu.Sticker]: stickerMenuOpen,
    [Menu.Saved]: savedMenuOpen,
    [Menu.Shapes]: shapesMenuOpen
  }

  const toolMenuMapping: { [key in DrawTool]: Menu | undefined } = {
    [DrawTool.Pen]: Menu.Pen,
    [DrawTool.Bucket]: Menu.Pen,
    [DrawTool.MobileEraser]: Menu.Eraser,
    [DrawTool.HealingEraser]: Menu.Eraser,
    [DrawTool.Lasso]: undefined,
    [DrawTool.Select]: undefined
  }

  function openToolMenu(tool: DrawTool, event: Event | undefined = undefined) {
    const menu = toolMenuMapping[tool]
    if (menu != undefined) openMenu(menu, event)
  }

  function openMenu(menu: Menu, event: Event | undefined = undefined) {
    menuMapping[menu].value = true
    if (event) menuEvent.value = event
  }

  return {
    penMenuOpen,
    eraserMenuOpen,
    stickerMenuOpen,
    savedMenuOpen,
    shapesMenuOpen,
    openMenu,
    openToolMenu,
    menuEvent
  }
})
