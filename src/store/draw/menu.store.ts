import { defineStore } from 'pinia'
import { Ref, ref } from 'vue'
import { DrawTool, Menu, StickersEmblemsSavedTabOptions } from '@/types/draw.types'

export const useMenuStore = defineStore('menu', () => {
  const penMenuOpen = ref(false)
  const eraserMenuOpen = ref(false)
  const stickerMenuOpen = ref(false)
  const shapesMenuOpen = ref(false)
  const cropperMenuOpen = ref(false)
  const selectMenuOpen = ref(false)
  const sendMenuOpen = ref(false)
  const moreToolsMenuOpen = ref(false)
  const selectMoreOptionsMenuOpen = ref(false)
  const selectColorMenuOpen = ref(false)
  const fontMenuOpen = ref(false)
  const textMenuOpen = ref(false)
  const selectImgStyleMenuOpen = ref(false)
  const feedbackMenuOpen = ref(false)
  const helpMenuOpen = ref(false)

  const stickersEmblemsSavedSelectedTab = ref<StickersEmblemsSavedTabOptions>('sticker')

  const menuEvent = ref<Event>()

  const menuMapping: { [key in Menu]: Ref<boolean> } = {
    [Menu.Pen]: penMenuOpen,
    [Menu.Eraser]: eraserMenuOpen,
    [Menu.StickerEmblemSaved]: stickerMenuOpen,
    [Menu.Shapes]: shapesMenuOpen,
    [Menu.Cropper]: cropperMenuOpen,
    [Menu.Select]: selectMenuOpen,
    [Menu.Send]: sendMenuOpen,
    [Menu.MoreTools]: moreToolsMenuOpen,
    [Menu.SelectMoreOptions]: selectMoreOptionsMenuOpen,
    [Menu.SelectColor]: selectColorMenuOpen,
    [Menu.Font]: fontMenuOpen,
    [Menu.Text]: textMenuOpen,
    [Menu.SelectImgStyle]: selectImgStyleMenuOpen,
    [Menu.FeedbackMenu]: feedbackMenuOpen,
    [Menu.HelpMenu]: helpMenuOpen
  }

  const toolMenuMapping: { [key in DrawTool]: Menu | undefined } = {
    [DrawTool.Pen]: Menu.Pen,
    [DrawTool.Bucket]: Menu.Pen,
    [DrawTool.MobileEraser]: Menu.Eraser,
    [DrawTool.HealingEraser]: Menu.Eraser,
    [DrawTool.Lasso]: Menu.Select,
    [DrawTool.Select]: Menu.Select
  }

  function openToolMenu(tool: DrawTool, event: Event | undefined = undefined) {
    const menu = toolMenuMapping[tool]
    if (menu != undefined) openMenu(menu, event)
  }

  function openMenu(menu: Menu, event: Event | undefined = undefined) {
    menuMapping[menu].value = !menuMapping[menu].value
    if (event) menuEvent.value = event
  }

  return {
    penMenuOpen,
    eraserMenuOpen,
    stickerMenuOpen,
    shapesMenuOpen,
    openMenu,
    openToolMenu,
    menuEvent,
    cropperMenuOpen,
    stickersEmblemsSavedSelectedTab,
    selectMenuOpen,
    sendMenuOpen,
    moreToolsMenuOpen,
    selectMoreOptionsMenuOpen,
    selectColorMenuOpen,
    selectImgStyleMenuOpen,
    textMenuOpen,
    fontMenuOpen,
    feedbackMenuOpen,
    helpMenuOpen
  }
})
