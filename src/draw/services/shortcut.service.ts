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
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'

export function useShortcutManager() {
  const { getSelectedObjects } = useSelect()
  const { selectedObjectsRef } = storeToRefs(useSelect())
  const historyManager = useDrawHistoryManager()

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

    switch (event.key.toLowerCase()) {
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
          historyManager.redo()
          break
        } else historyManager.undo()
        dismissPopover()
        break

      case Shortcut.send:
        event.preventDefault()
        const { isModal } = useDrawStore()
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
        moveSelection(1, selectedTool)
        break

      case Shortcut.selectPrev:
        event.preventDefault()
        moveSelection(-1, selectedTool)
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
        if (!isSelectMode.value) return
        event.preventDefault()
        selectAction(DrawAction.FlipX, { objects: getSelectedObjects(), setActiveObject: true })
        dismissPopover()
        break

      case Shortcut.flipY:
        if (!isSelectMode.value) return
        event.preventDefault()
        selectAction(DrawAction.FlipY, { objects: getSelectedObjects(), setActiveObject: true })
        dismissPopover()
        break


      case Shortcut.paste:
        if (isSelectMode.value) c?.discardActiveObject()
        const items = await navigator.clipboard.read()

        for (const item of items) {
          for (const type of item.types) {
            if (!type.includes('image')) continue
            event.preventDefault()
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

  function wrapIndex(index: number, length: number) {
    return (index + length) % length
  }


  function moveSelection(delta: 1 | -1, selectedTool: DrawTool) {
    if (selectedTool !== DrawTool.Select) return
    const objects = c?.getObjects()
    if (!objects || objects.length === 0) return

    const active = c!._activeObject
    let nextIndex = wrapIndex(selectIndex + delta, objects.length)

    // skip currently active object if possible
    if (
      active &&
      objects.length > 1 &&
      objects[nextIndex].id === active.id
    ) {
      nextIndex = wrapIndex(nextIndex + delta, objects.length)
    }

    selectIndex = nextIndex
    c!.setActiveObject(objects[selectIndex])
    c!.requestRenderAll()
    dismissPopover()
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