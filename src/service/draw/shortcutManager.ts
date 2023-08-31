import { useDrawStore } from '@/store/draw/draw.store'
import { isMac } from '@/helper/draw/draw.helper'
import { useSelect } from '@/service/draw/tools/select.tool'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { DrawAction, DrawTool, ObjectType } from '@/types/draw.types'
import { Shortcut } from '@/config/draw/shortcut.config'
import { modalController, popoverController } from '@ionic/vue'
import { Canvas } from 'fabric/fabric-impl'
import { useHistory } from '@/service/draw/history.service'
import { fabric } from 'fabric'

export function useShortcutManager() {
  const { getSelectedObjects } = useSelect()
  const { addPrevModifiedObjectsToStack } = useHistory()
  const { selectedObjectsRef } = storeToRefs(useSelect())

  const isSelectMode = computed(() => selectedObjectsRef.value.length > 0)
  let selectIndex = 0
  let c: Canvas | undefined

  async function dismissPopover() {
    const popover = await popoverController.getTop()
    if (popover) popoverController.dismiss()
  }

  function handleMovement(key: string, activeObject: any, modifier: any, event: any) {
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

    addPrevModifiedObjectsToStack(
      activeObject.type == ObjectType.selection ? (activeObject as fabric.ActiveSelection).getObjects() : [activeObject]
    )
    c?.requestRenderAll()
    dismissPopover()
  }

  async function handleKeydown(event: any) {
    const { selectAction, selectedTool } = useDrawStore()

    const modifier = isMac() ? event.metaKey : event.ctrlKey

    if (event.key == Shortcut.unselect) {
      event.preventDefault()
      c?.discardActiveObject()
      dismissPopover()
    }

    if ([Shortcut.moveLeft, Shortcut.moveRight, Shortcut.moveUp, Shortcut.moveDown].includes(event.key)) {
      event.preventDefault()
      if (!isSelectMode.value) return

      const activeObject = c!.getActiveObject()!
      handleMovement(event.key, activeObject, modifier, event)
    }

    if (!modifier) return

    switch (event.key) {
      case Shortcut.pen:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById('pen')!.click()
        dismissPopover()
        break

      case Shortcut.eraser:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById('eraser')!.click()
        dismissPopover()
        break

      case Shortcut.moreTools:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById('more_tools')!.click()
        dismissPopover()
        break

      case Shortcut.select:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById('select-tool')!.click()
        dismissPopover()
        break

      case Shortcut.manual:
        event.preventDefault()
        if (isSelectMode.value) return
        document.getElementById('docs')!.click()
        dismissPopover()
        const modal = await modalController.getTop()
        if (modal) modalController.dismiss()
        break

      case Shortcut.undoredo:
        event.preventDefault()
        if (event.shiftKey) {
          if (!document.getElementById('redo')!.ariaDisabled) document.getElementById('redo')!.click()
          break
        } else if (!document.getElementById('undo')!.ariaDisabled) document.getElementById('undo')!.click()
        dismissPopover()
        break

      case Shortcut.send:
        event.preventDefault()
        if (isSelectMode.value) return
        if (!document.getElementById('send-drawing')!.ariaDisabled) document.getElementById('send-drawing')!.click()
        dismissPopover()
        break

      case Shortcut.delete:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.Delete, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.selectNext:
        event.preventDefault()
        if (selectedTool != DrawTool.Select || c?.getObjects().length == 0) return

        selectIndex++
        if (selectIndex >= c!.getObjects().length) selectIndex = 0
        if (
          c!._activeObject &&
          c!.getObjects().length > 1 &&
          c!.getObjects().at(selectIndex)!.id == c!._activeObject.id
        )
          selectIndex++
        if (selectIndex < 0) selectIndex = c!.getObjects().length - 1
        c!.setActiveObject(c!.getObjects().at(selectIndex)!)
        dismissPopover()
        break

      case Shortcut.selectPrev:
        event.preventDefault()
        if (selectedTool != DrawTool.Select || c?.getObjects().length == 0) return

        selectIndex--
        if (selectIndex < 0) selectIndex = c!.getObjects().length - 1
        if (
          c!._activeObject &&
          c!.getObjects().length > 1 &&
          c!.getObjects().at(selectIndex)!.id == c!._activeObject.id
        )
          selectIndex--
        if (selectIndex < 0) selectIndex = c!.getObjects().length - 1
        c!.setActiveObject(c!.getObjects().at(selectIndex)!)
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
        selectAction(DrawAction.CreateSaved, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.layerUp:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.MoveUpOneLayer, { objects: getSelectedObjects() })
        dismissPopover()
        break

      case Shortcut.layerDown:
        event.preventDefault()
        if (!isSelectMode.value) return
        selectAction(DrawAction.MoveDownOneLayer, { objects: getSelectedObjects() })
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
              selectAction(DrawAction.Sticker, { img: reader.result })
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
    c = canvas
    window.addEventListener('keydown', handleKeydown)
  }

  function destroy() {
    window.removeEventListener('keydown', handleKeydown)
  }

  return { init, destroy }
}
