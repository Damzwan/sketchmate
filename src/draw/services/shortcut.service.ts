import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { DrawAction, DrawTool, Menu } from '@/draw/types/draw.types'
import { Shortcut } from '@/draw/config/shortcut.config'
import { modalController, popoverController } from '@ionic/vue'
import { Canvas } from 'fabric/fabric-impl'
import { ToolbarIds } from '@/draw/config/toolbar.config'
import { useSelect } from '@/draw/store/tools/select.store'
import { isMac } from '@/helper/general.helper'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useMenuStore } from '@/store/menu.store'

export function useShortcutManager() {
  const { getSelectedObjects } = useSelect()
  const { selectedObjectsRef } = storeToRefs(useSelect())

  const isSelectMode = computed(() => selectedObjectsRef.value.length > 0)
  let selectIndex = 0
  let c: Canvas | undefined

  async function dismissPopover() {
    const popover = await popoverController.getTop()
    if (popover) popoverController.dismiss()
  }

  function handleMovement(key: string, activeObject: any, modifier: any, event: any) {
    const transform: any = {
      target: activeObject,
      original: {
        left: activeObject.left,
        top: activeObject.top,
        scaleX: activeObject.scaleX,
        scaleY: activeObject.scaleY,
        angle: activeObject.angle
      }
    }

    switch (key) {
      case Shortcut.moveLeft:
        if (modifier) activeObject.rotate(activeObject.angle - 5)
        else if (event.shiftKey)
          activeObject.set({ scaleX: activeObject.scaleX! - 0.05, scaleY: activeObject.scaleY! - 0.05 })
        else activeObject.set({ left: activeObject.left! - 5 })
        break
      case Shortcut.moveRight:
        if (modifier) activeObject.rotate(activeObject.angle + 5)
        else if (event.shiftKey)
          activeObject.set({ scaleX: activeObject.scaleX! + 0.05, scaleY: activeObject.scaleY! + 0.05 })
        else activeObject.set({ left: activeObject.left! + 5 })
        break
      case Shortcut.moveDown:
        if (modifier) return
        activeObject.set({ top: activeObject.top! + 5 })
        break
      case Shortcut.moveUp:
        if (modifier) return
        activeObject.set({ top: activeObject.top! - 5 })
        break
    }


    activeObject.setCoords()
    c?.requestRenderAll()
    c?.fire('object:modified', { target: activeObject, transform })
    dismissPopover()
  }

  async function handleKeydown(event: any) {
    const { selectAction } = useDrawStore()
    const { selectedTool, selectTool } = useToolSelection()

    const modifier = isMac() ? event.metaKey : event.ctrlKey

    if (event.key == Shortcut.unselect) {
      event.preventDefault()
      selectAction(DrawAction.UnselectObjects, undefined)
      dismissPopover()
    }

    if ([Shortcut.moveLeft, Shortcut.moveRight, Shortcut.moveUp, Shortcut.moveDown].includes(event.key)) {
      event.preventDefault()
      if (!isSelectMode.value) return

      const activeObject = c!.getActiveObject()!
      handleMovement(event.key, activeObject, modifier, event)
    }

    if (event.key == Shortcut.delete2) {
      event.preventDefault()
      if (!isSelectMode.value) return
      selectAction(DrawAction.RemoveSelectedObjects, undefined)
      dismissPopover()
    }

    if (!modifier) return

    switch (event.key) {
      case Shortcut.pen:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById(ToolbarIds.pen)!.click()
        dismissPopover()
        break

      case Shortcut.eraser:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById(ToolbarIds.eraser)!.click()
        dismissPopover()
        break

      case Shortcut.moreTools:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById(ToolbarIds.moreTools)!.click()
        dismissPopover()
        break

      case Shortcut.select:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById(ToolbarIds.select)!.click()
        dismissPopover()
        break

      case Shortcut.bucket:
        event.preventDefault()
        if (isSelectMode.value) return
        selectTool(DrawTool.Bucket)
        dismissPopover()
        break

      case Shortcut.penBrush:
        event.preventDefault()
        if (isSelectMode.value) return
        selectTool(DrawTool.Pen)
        dismissPopover()
        break

      case Shortcut.manual:
        event.preventDefault()
        if (isSelectMode.value) return
        const { openMenu } = useMenuStore()
        openMenu(Menu.HelpMenu)
        dismissPopover()
        const modal = await modalController.getTop()
        if (modal) modalController.dismiss()
        break

      case Shortcut.undoredo:
        event.preventDefault()
        if (event.shiftKey) {
          if (!document.getElementById(ToolbarIds.redo)!.ariaDisabled) document.getElementById(ToolbarIds.redo)!.click()
          break
        } else if (!document.getElementById(ToolbarIds.undo)!.ariaDisabled) document.getElementById(ToolbarIds.undo)!.click()
        dismissPopover()
        break

      case Shortcut.send:
        event.preventDefault()
        const {isModal} = useDrawStore()
        if (isSelectMode.value || isModal) return
        if (!document.getElementById(ToolbarIds.send)!.ariaDisabled) document.getElementById(ToolbarIds.send)!.click()
        dismissPopover()
        break

      case Shortcut.delete:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.RemoveSelectedObjects, undefined)
        dismissPopover()
        break

      case Shortcut.selectNext:
        event.preventDefault()
        if (selectedTool != DrawTool.Select || c?.getObjects().length == 0) return

        const allObjectss = c!.getObjects()

        selectIndex++
        if (selectIndex >= allObjectss.length) selectIndex = 0
        if (
          c!._activeObject &&
          allObjectss.length > 1 &&
          allObjectss.at(selectIndex)!.id == c!._activeObject.id
        )
          selectIndex++
        if (selectIndex < 0) selectIndex = allObjectss.length - 1
        c!.setActiveObject(allObjectss.at(selectIndex)!)
        dismissPopover()
        break

      case Shortcut.selectPrev:
        event.preventDefault()
        if (selectedTool != DrawTool.Select || c?.getObjects().length == 0) return

        const allObjects = c!.getObjects()

        selectIndex--
        if (selectIndex < 0) selectIndex = allObjects.length - 1
        if (
          c!._activeObject &&
          allObjects.length > 1 &&
          allObjects.at(selectIndex)!.id == c!._activeObject.id
        )
          selectIndex--
        if (selectIndex < 0) selectIndex = allObjects.length - 1
        c!.setActiveObject(allObjects.at(selectIndex)!)
        dismissPopover()
        break

      case Shortcut.merge:
        event.preventDefault()
        if (!isSelectMode.value || selectedObjectsRef.value.length < 2) return
        selectAction(DrawAction.Merge, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.copy:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.CopyObject, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.save:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.SaveFabricObject, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.layerUp:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.MoveObjectUpOneLayer, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.layerDown:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.MoveObjectDownOneLayer, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.flipX:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.FlipX, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.flipY:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.FlipY, { objects: getSelectedObjects() })
        dismissPopover()
        break


      case Shortcut.paste:
        event.preventDefault()
        if (isSelectMode.value) c?.discardActiveObject()
        const items = await navigator.clipboard.read()

        for (const item of items) {
          for (const type of item.types) {
            if (!type.includes('image')) continue
            const blob = await item.getType(type)
            const reader = new FileReader()
            reader.onloadend = () => {
              if (!reader.result) return
              selectAction(DrawAction.AddImage, { imageUrl: reader.result as string })
            }
            reader.readAsDataURL(blob)
            dismissPopover()
            break
          }
        }
        break
    }
  }

  function init(canvas: Canvas) {
    destroy()
    c = canvas
    window.addEventListener('keydown', handleKeydown)
  }

  function destroy() {
    window.removeEventListener('keydown', handleKeydown)
  }

  return { init, destroy }
}