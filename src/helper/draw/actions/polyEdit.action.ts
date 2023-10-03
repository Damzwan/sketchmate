import { Canvas } from 'fabric/fabric-impl'
import { useSelect } from '@/service/draw/tools/select.tool'
import { fabric } from 'fabric'

export function editPolygon(c: Canvas): void {
  const { selectedObjectsRef } = useSelect()
  const poly = selectedObjectsRef[0] as fabric.Polygon
  poly.edit = !poly.edit

  if (poly.edit) {
    poly.objectCaching = true
    const lastControl = poly.points!.length - 1
    poly.cornerColor = 'rgba(0,0,255,0.5)'
    poly.controls = poly.points!.reduce(function (acc: any, point, index) {
      acc['p' + index] = new fabric.Control({
        positionHandler: polygonPositionHandler,
        actionHandler: anchorWrapper(index > 0 ? index - 1 : lastControl, actionHandler),
        actionName: 'modifyPolygon',
        pointIndex: index
      })
      return acc
    }, {})
    poly.hasBorders = false
  } else {
    disableEditing(poly)
  }
  c.requestRenderAll()
}

export function disableEditing(poly: fabric.Polygon) {
  poly.edit = false
  poly.objectCaching = false
  poly.cornerColor = fabric.Object.prototype.cornerColor
  poly.controls = fabric.Object.prototype.controls
  poly.hasBorders = true
}

function polygonPositionHandler(this: any, dim: any, finalMatrix: any, fabricObject: any) {
  const x = fabricObject.points[this.pointIndex].x - fabricObject.pathOffset.x,
    y = fabricObject.points[this.pointIndex].y - fabricObject.pathOffset.y
  return fabric.util.transformPoint(
    { x: x, y: y } as any,
    fabric.util.multiplyTransformMatrices(fabricObject.canvas.viewportTransform, fabricObject.calcTransformMatrix())
  )
}

function getObjectSizeWithStroke(object: any) {
  const stroke = new fabric.Point(
    object.strokeUniform ? 1 / object.scaleX : 1,
    object.strokeUniform ? 1 / object.scaleY : 1
  ).multiply(object.strokeWidth)
  return new fabric.Point(object.width + stroke.x, object.height + stroke.y)
}

// define a function that will define what the control does
// this function will be called on every mouse move after a control has been
// clicked and is being dragged.
// The function receive as argument the mouse event, the current trasnform object
// and the current position in canvas coordinate
// transform.target is a reference to the current object being transformed,
function actionHandler(eventData: any, transform: any, x: any, y: any) {
  const polygon = transform.target,
    currentControl = polygon.controls[polygon.__corner],
    mouseLocalPosition = polygon.toLocalPoint(new fabric.Point(x, y), 'center', 'center'),
    polygonBaseSize = getObjectSizeWithStroke(polygon),
    size = polygon._getTransformedDimensions(0, 0),
    finalPointPosition = {
      x: (mouseLocalPosition.x * polygonBaseSize.x) / size.x + polygon.pathOffset.x,
      y: (mouseLocalPosition.y * polygonBaseSize.y) / size.y + polygon.pathOffset.y
    }
  polygon.points[currentControl.pointIndex] = finalPointPosition
  polygon.dirty = true
  return true
}

// define a function that can keep the polygon in the same position when we change its
// width/height/top/left.
function anchorWrapper(anchorIndex: any, fn: any) {
  return function (eventData: any, transform: any, x: any, y: any) {
    const fabricObject = transform.target,
      absolutePoint = fabric.util.transformPoint(
        {
          x: fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x,
          y: fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y
        } as any,
        fabricObject.calcTransformMatrix()
      ),
      actionPerformed = fn(eventData, transform, x, y),
      newDim = fabricObject._setPositionDimensions({}),
      polygonBaseSize = getObjectSizeWithStroke(fabricObject),
      newX = (fabricObject.points[anchorIndex].x - fabricObject.pathOffset.x) / polygonBaseSize.x,
      newY = (fabricObject.points[anchorIndex].y - fabricObject.pathOffset.y) / polygonBaseSize.y
    fabricObject.setPositionByOrigin(absolutePoint, newX + 0.5, newY + 0.5)
    return actionPerformed
  }
}
