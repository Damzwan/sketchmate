import { Canvas } from 'fabric/fabric-impl'
import { v4 as uuidv4 } from 'uuid'
import { disableObjectSelect, enableObjectIdSaving } from '@/helper/draw/draw.helper'
import { Layer } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw.store'

export function enableObjectCreationEvent(c: Canvas) {
  const { setLastModifiedObjects } = useDrawStore()
  c.on('object:added', e => {
    const obj = e.target as any
    obj.id = uuidv4()
    enableObjectIdSaving(obj)

    // if (obj.type == 'path') {
    //   c.moveTo(obj, Layer.obj)
    // }

    setLastModifiedObjects([obj])
    if (c.isDrawingMode) disableObjectSelect(obj)
  })
}

export function enableObjectModifiedEvent(c: Canvas) {
  const { setLastModifiedObjects } = useDrawStore()
  c.on('object:modified', e => {
    const obj = e.target as any
    setLastModifiedObjects([obj])
  })
}
