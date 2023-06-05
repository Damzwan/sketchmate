import { Canvas } from 'fabric/fabric-impl'
import { v4 as uuidv4 } from 'uuid'
import { enableObjectIdSaving, setObjectSelection } from '@/helper/draw/draw.helper'

export function enableObjectCreationEvent(c: Canvas) {
  c.on('object:added', e => {
    const obj = e.target as any
    obj.id = uuidv4()
    enableObjectIdSaving(obj)

    // if (obj.type == 'path') {
    //   c.moveTo(obj, Layer.obj)
    // }

    if (c.isDrawingMode) setObjectSelection(obj, false)
  })
}
