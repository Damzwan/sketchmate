import { DrawEvent, DrawTool, FabricEvent, ToolService } from '@/types/draw.types'
import { Canvas, Point } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { useHistory } from '@/service/draw/history.service'
import { useDrawStore } from '@/store/draw/draw.store'

interface Lasso extends ToolService {
  init: (c: Canvas) => void
}

export const useLasso = defineStore('lasso', (): Lasso => {
  let c: Canvas | undefined = undefined
  const events: FabricEvent[] = [
    {
      on: 'mouse:down',
      type: DrawEvent.Lasso,
      handler: onMouseDown
    },
    {
      on: 'mouse:move',
      type: DrawEvent.Lasso,
      handler: onMouseMove
    },
    {
      on: 'mouse:up',
      type: DrawEvent.Lasso,
      handler: onMouseUp
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
  }

  let lasso: fabric.Path
  let isDrawing = false
  function onMouseDown(o: fabric.IEvent) {
    const { disableHistorySaving } = useHistory()
    disableHistorySaving()
    isDrawing = true
    const pointer = c!.getPointer(o.e) as Point
    const pathData = `M ${pointer.x} ${pointer.y} `
    lasso = createSelectionLine(pathData)
    c!.add(lasso)
  }

  function onMouseMove(o: fabric.IEvent) {
    if (!isDrawing) return
    const pointer = c!.getPointer(o.e)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    lasso.path.push(['L', pointer.x, pointer.y])

    c?.remove(lasso)

    lasso = createSelectionLine(lasso.path!)
    c?.add(lasso)

    // lasso.set({ path: pathData, dirty: true })
    c!.renderAll()
  }

  function onMouseUp(o: fabric.IEvent) {
    isDrawing = false
    c?.remove(lasso)
    selectsObjectsInsideLasso()
  }

  function selectsObjectsInsideLasso() {
    const objectsInsideLasso = c?.getObjects().filter(obj => isInsideLasso(obj))
    if (!objectsInsideLasso || objectsInsideLasso.length == 0) return
    const { selectTool } = useDrawStore()
    selectTool(DrawTool.Select)

    if (objectsInsideLasso.length == 1) c!.setActiveObject(objectsInsideLasso[0])
    else c!.setActiveObject(new fabric.ActiveSelection(objectsInsideLasso, { canvas: c! }))
  }

  function isInsideLasso(obj: fabric.Object) {
    const objBox = obj.getBoundingRect(true)
    const lassoBox = lasso.getBoundingRect(true)
    return (
      objBox.left >= lassoBox.left &&
      objBox.top >= lassoBox.top &&
      objBox.left + objBox.width <= lassoBox.left + lassoBox.width &&
      objBox.top + objBox.height <= lassoBox.top + lassoBox.height
    )
  }

  function createSelectionLine(pathData: string | Point[]) {
    return new fabric.Path(pathData, {
      fill: 'rgba(0,0,0,0)',
      stroke: '#333',
      strokeWidth: 0.5, // Make the line thinner
      strokeDashArray: [5, 5], // Make the line dashed
      selectable: false
    })
  }

  async function select(canvas: Canvas) {
    console.log('lasso tool selected')
  }

  return { select, events, init }
})
