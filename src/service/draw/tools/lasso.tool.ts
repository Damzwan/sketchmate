import { DrawEvent, DrawTool, FabricEvent, ObjectType, Shape, ToolService } from '@/types/draw.types'
import { Canvas, Circle, Ellipse, Path, Point } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { useHistory } from '@/service/draw/history.service'
import { svgPathProperties } from 'svg-path-properties'
import inside from 'point-in-polygon'
import { useDrawStore } from '@/store/draw/draw.store'
import { useSelect } from '@/service/draw/tools/select.tool'
import { downSampleCircle, downSampleEllipse } from '@/helper/draw/lasso.helper'

export const useLasso = defineStore('lasso', (): ToolService => {
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
    const { enableHistorySaving } = useHistory()
    enableHistorySaving()
  }

  function selectsObjectsInsideLasso() {
    const objectsInsideBoundingRect = c?.getObjects().filter(obj => isInsideLassoBoundingRect(obj))
    if (!objectsInsideBoundingRect || objectsInsideBoundingRect.length == 0) return

    const downSampledLasso = downSamplePath(lasso)
    const pointRepresentation = objectsInsideBoundingRect.map(obj => getPointRepresentation(obj))
    const objectsInsideLasso = objectsInsideBoundingRect.filter((obj, i) =>
      isInsideLasso(pointRepresentation[i], downSampledLasso)
    )

    if (!objectsInsideLasso || objectsInsideLasso.length == 0) return

    const { selectTool } = useDrawStore()
    selectTool(DrawTool.Select)

    if (objectsInsideLasso.length == 1) c!.setActiveObject(objectsInsideLasso[0])
    else c!.setActiveObject(new fabric.ActiveSelection(objectsInsideLasso, { canvas: c! }))

    // TODO somehow doing an active selection will not allow you to merge since it is treated as a single object
    const { setSelectedObjects } = useSelect()
    setSelectedObjects(objectsInsideLasso)
  }

  function isInsideLasso(pointRepresentation: number[][], downSampledLasso: number[][]) {
    return pointRepresentation.every(point => inside(point, downSampledLasso))
  }

  function isInsideLassoBoundingRect(obj: fabric.Object) {
    const objBox = obj.getBoundingRect(true)
    const lassoBox = lasso.getBoundingRect(true)
    return (
      objBox.left >= lassoBox.left &&
      objBox.top >= lassoBox.top &&
      objBox.left + objBox.width <= lassoBox.left + lassoBox.width &&
      objBox.top + objBox.height <= lassoBox.top + lassoBox.height
    )
  }

  function getPointRepresentation(obj: fabric.Object) {
    if (obj.type === ObjectType.path) return downSamplePath(obj as Path)
    else if (obj.type === Shape.Circle) {
      return downSampleCircle(obj as Circle)
    } else if (obj.type === Shape.Ellipse) {
      return downSampleEllipse(obj as Ellipse)
    } else {
      return obj.getCoords().map(p => [p.x, p.y])
    }
  }

  function downSamplePath(path: fabric.Path, numPoints = 30): number[][] {
    if (!path.path) return []

    // Get the path's scale
    const scaleX = path.scaleX || 1
    const scaleY = path.scaleY || 1

    let pathString = ''
    for (let i = 0; i < path.path.length; i++) {
      const command: any = path.path[i]
      pathString += command[0] + command.slice(1).join(',')
    }
    const properties = new svgPathProperties(pathString)

    const totalLength = properties.getTotalLength()

    // Calculate the length between points
    const lengthBetweenPoints = totalLength / numPoints

    // Sample points along the path
    const points: number[][] = []
    for (let i = 0; i < totalLength; i += lengthBetweenPoints) {
      const point = properties.getPointAtLength(i)
      // Scale the points
      points.push([point.x * scaleX, point.y * scaleY])
    }

    return points
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
