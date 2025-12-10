import { FabricObject, IText } from 'fabric'
import { isMobile } from '@/helper/general.helper'
import { ObjectType } from '@/draw/types/draw.types'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'

export function focusText(text: IText) {
  if (isMobile()) {
    setTimeout(() => {
      text.enterEditing()
      text.hiddenTextarea!.focus() // This line is especially important for mobile
    }, 300)
  } else {
    setTimeout(() => {
      text.enterEditing()
      text.hiddenTextarea!.focus() // This line is especially important for mobile
    }, 200)
  }
}

export function isText(objects: FabricObject[]) {
  return objects.length == 1 && objects[0].type == ObjectType.text
}

export function exitEditing(text: any) {
  if (text.type != ObjectType.text || !text.isEditing || text.text == '') return
  text.exitEditing()
  const { isEditingText } = storeToRefs(useDrawStore())
  isEditingText.value = false
}

