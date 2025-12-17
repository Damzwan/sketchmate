import * as fabric from 'fabric'
import { ActiveSelection, Canvas, Circle, Ellipse, FabricObject, Path, Point } from 'fabric'
import { defineStore } from 'pinia'
import { svgPathProperties } from 'svg-path-properties'
import inside from 'point-in-polygon'
import { DrawTool, FabricEvent, ObjectType, Shape, ToolService } from '@/draw/types/draw.types'
import {
  createPointRepresentationForBoundingRect,
  downSampleCircle,
  downSampleEllipse
} from '@/draw/helpers/tools/lasso.helper'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { isMobile } from '@/helper/general.helper'

export const useLasso = defineStore('lasso', (): ToolService => {
  let c: Canvas | undefined = undefined
  const { actionWithoutEvents } = useDrawEventManager()

  const events: FabricEvent[] = [
    {
      on: 'mouse:down',
      handler: onMouseDown
    },
    {
      on: 'mouse:move',
      handler: onMouseMove
    },
    {
      on: 'mouse:up',
      handler: onMouseUp
    },
    {
      on: 'gestureStart', handler: () => {
        isDrawing = false
        c?.remove(lasso)
        c?.requestRenderAll()
      }
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
  }

  let lasso: Path
  let isDrawing = false

  function onMouseDown(o: any) {
    if (!isMobile() && o.e.button !== 0) return
    isDrawing = true
    const zoom = c!.getZoom()
    const pointer = c!.getViewportPoint(o.e) as Point
    const pathData = `M ${pointer.x / zoom} ${pointer.y / zoom}`

    lasso = createSelectionLine(pathData, c!)
    lasso.objectCaching = false
    actionWithoutEvents(() => {
      c!.add(lasso)
    })
  }

  function onMouseMove(o: any) {
    if (!isDrawing || !lasso) return
    const zoom = c!.getZoom()
    const pointer = c!.getViewportPoint(o.e)
    lasso.path?.push(['L', pointer.x / zoom, pointer.y / zoom])
    lasso.set({ dirty: true }) // ensure Fabric knows it changed
    lasso.setCoords()          // update internal coordinates
    c?.requestRenderAll()
  }

  function onMouseUp() {
    if (!lasso) return
    isDrawing = false
    c?.remove(lasso)
    selectsObjectsInsideLasso()
    c?.requestRenderAll()
  }


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

    const { selectTool } = useToolSelection()
    selectTool(DrawTool.Select)
    if (objectsInsideLasso.length > 1) {
      const activeSelection = new ActiveSelection(objectsInsideLasso, { canvas: c })
      c!.setActiveObject(activeSelection)
    } else {
      c!.setActiveObject(objectsInsideLasso[0])
    }
    c?.requestRenderAll()
  }

  function isInsideLasso(pointRepresentation: number[][], downSampledLasso: number[][]): boolean {
    const insidePoints = pointRepresentation.filter(point => inside(point, downSampledLasso))

    // Calculate the percentage of points inside the lasso
    const percentageInside = (insidePoints.length / pointRepresentation.length) * 100

    // Consider the object as inside the lasso if 85% or more of its points are inside
    return percentageInside >= 85
  }

  function getPointRepresentation(obj: FabricObject) {
    if (obj.type === ObjectType.path) return downSamplePath(obj as Path)
    else if (obj.type === Shape.Circle) {
      return downSampleCircle(obj as Circle)
    } else if (obj.type === Shape.Ellipse) {
      return downSampleEllipse(obj as Ellipse)
    } else {
      return createPointRepresentationForBoundingRect(obj)
    }
  }

  function downSamplePath(path: Path, numPoints = 30): number[][] {
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

  function createSelectionLine(pathData: string, c: Canvas) {
    const vpt = c.viewportTransform
    const zoom = c.getZoom()

    return new Path(pathData, {
      fill: 'rgba(0,0,0,0)',
      stroke: '#333',
      strokeWidth: 0.5, // Make the line thinner
      strokeDashArray: [5, 5], // Make the line dashed
      selectable: false,
      evented: false,
      strokeUniform: true,
      left: -vpt[4] / zoom,
      top: -vpt[5] / zoom
    })
  }

  async function select() {
    c!.selection = false
    c!.isDrawingMode = false
    c!.skipTargetFind = true

  }

  return { select, events, init }
})