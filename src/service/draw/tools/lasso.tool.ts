import { DrawEvent, FabricEvent, ObjectType, Shape, ToolService } from '@/types/draw.types'
import { Canvas, Circle, Ellipse, Path, Point } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { useHistory } from '@/service/draw/history.service'
import { svgPathProperties } from 'svg-path-properties'
import inside from 'point-in-polygon'
import {
  createPointRepresentationForBoundingRect,
  downSampleCircle,
  downSampleEllipse
} from '@/helper/draw/lasso.helper'
import { initSelectWithObjects } from '@/helper/draw/draw.helper'
import { EventBus } from '@/main'

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

  function destroy() {
    c = undefined
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
    lasso.objectCaching = false
    c!.add(lasso)
  }

  function onMouseMove(o: fabric.IEvent) {
    if (!isDrawing) return
    const pointer = c!.getPointer(o.e)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    lasso.path.push(['L', pointer.x, pointer.y])
    lasso.dirty = true // This tells Fabric.js that the object has changed and needs re-rendering
    c?.requestRenderAll()
  }

  function onMouseUp() {
    isDrawing = false
    c?.remove(lasso)
    selectsObjectsInsideLasso()
    const { enableHistorySaving } = useHistory()
    enableHistorySaving()
    c?.requestRenderAll()
  }

  EventBus.on('gesture', () => {
    isDrawing = false
    c?.remove(lasso)
    c?.requestRenderAll()
  })

  function selectsObjectsInsideLasso() {
    const objectsInsideBoundingRect = c?.getObjects()
    if (!objectsInsideBoundingRect || objectsInsideBoundingRect.length == 0) return

    lasso.canvas = c!
    const downSampledLasso = downSamplePath(lasso)
    const pointRepresentation = objectsInsideBoundingRect.map(obj => getPointRepresentation(obj))
    const objectsInsideLasso = objectsInsideBoundingRect.filter((obj, i) =>
      isInsideLasso(pointRepresentation[i], downSampledLasso)
    )

    if (!objectsInsideLasso || objectsInsideLasso.length == 0) return

    // console.log(lasso, objectsInsideLasso)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // const b = new fabric.EraserBrush(c)
    // c!.freeDrawingBrush = b
    //
    // const pathData = b.convertPointsToSVGPath(downSampledLasso.map(p => new fabric.Point(p[0], p[1])))
    // const path = b.createPath(pathData)
    // path.fill = path.stroke
    // path.setCoords()
    // b.applyEraserToCanvas(path)
    //
    // c?.forEachObject(function (obj) {
    //   b._addPathToObjectEraser(obj, path)
    // })
    //
    // c?.requestRenderAll()
    initSelectWithObjects(c!, objectsInsideLasso)
  }

  function isInsideLasso(pointRepresentation: number[][], downSampledLasso: number[][]): boolean {
    const insidePoints = pointRepresentation.filter(point => inside(point, downSampledLasso))

    // Calculate the percentage of points inside the lasso
    const percentageInside = (insidePoints.length / pointRepresentation.length) * 100

    // Consider the object as inside the lasso if 85% or more of its points are inside
    return percentageInside >= 85
  }

  function getPointRepresentation(obj: fabric.Object) {
    if (obj.type === ObjectType.path) return downSamplePath(obj as Path)
    else if (obj.type === Shape.Circle) {
      return downSampleCircle(obj as Circle)
    } else if (obj.type === Shape.Ellipse) {
      return downSampleEllipse(obj as Ellipse)
    } else {
      return createPointRepresentationForBoundingRect(obj)
    }
  }

  function downSamplePath(path: fabric.Path, numPoints = 30): number[][] {
    if (!path.path || !path.canvas) return []

    let pathString = ''
    for (let i = 0; i < path.path.length; i++) {
      const command: any = path.path[i]
      pathString += command[0] + command.slice(1).join(',')
    }

    const properties = new svgPathProperties(pathString)
    const totalLength = properties.getTotalLength()

    // Calculate the length between points
    const lengthBetweenPoints = totalLength / numPoints

    // Multiply the viewport transform with the path's transform matrix
    const transformationMatrix = fabric.util.multiplyTransformMatrices(
      path.canvas.viewportTransform!,
      path.calcTransformMatrix()
    )

    // Sample points along the path
    const points: number[][] = []
    for (let i = 0; i < totalLength; i += lengthBetweenPoints) {
      const point = properties.getPointAtLength(i)

      // https://medium.com/@luizzappa/how-to-find-out-the-coordinates-of-vertices-of-a-shape-in-fabric-js-a871109085c1
      const correctedPoint = { x: point.x - path.pathOffset.x, y: point.y - path.pathOffset.y }
      const transformedPoint = fabric.util.transformPoint(
        new fabric.Point(correctedPoint.x, correctedPoint.y),
        transformationMatrix
      )

      points.push([transformedPoint.x, transformedPoint.y])
    }

    return points
  }

  function createSelectionLine(pathData: string | Point[]) {
    return new fabric.Path(pathData, {
      fill: 'rgba(0,0,0,0)',
      stroke: '#333',
      strokeWidth: 0.5, // Make the line thinner
      strokeDashArray: [5, 5], // Make the line dashed
      selectable: false,
      evented: false
    })
  }

  async function select() {
    console.log('lasso tool selected')
  }

  return { select, events, init, destroy }
})
