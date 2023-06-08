import { fabric } from 'fabric'

export class WatercolorBrush extends fabric.BaseBrush {
  opacityMin: number
  opacityMax: number
  color = '#000'
  width = 30

  _points: Array<{ x: number; y: number; opacity: number }>

  constructor(canvas: fabric.Canvas, opacityMin = 0.4, opacityMax = 0.9) {
    super()

    this.canvas = canvas
    this.opacityMin = opacityMin
    this.opacityMax = opacityMax
    this._points = []
  }

  onMouseDown(pointer: { x: number; y: number }) {
    this._points.push({
      ...pointer,
      opacity: this.opacityMin + Math.random() * (this.opacityMax - this.opacityMin)
    })
    this.canvas.fire('before:path:created', { path: this })
  }

  onMouseMove(pointer: { x: number; y: number }) {
    this._points.push({
      ...pointer,
      opacity: this.opacityMin + Math.random() * (this.opacityMax - this.opacityMin)
    })

    this._render()
  }

  _finalizeAndAddPath() {
    const ctx = this.canvas.contextContainer

    this._points.forEach((point, i) => {
      ctx.beginPath() // start a new path for each point
      ctx.globalAlpha = point.opacity

      if (i === 0) {
        ctx.moveTo(point.x, point.y)
      } else {
        const previousPoint = this._points[i - 1]
        ctx.moveTo(previousPoint.x, previousPoint.y)
        ctx.lineTo(point.x, point.y)
      }

      ctx.stroke()
    })

    ctx.globalAlpha = 1 // reset opacity
    this._points = [] // reset points
  }

  onMouseUp() {
    this._finalizeAndAddPath()
  }

  _render() {
    const ctx = this.canvas.contextTop
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

    this._points.forEach((point, i) => {
      ctx.beginPath() // start a new path for each point
      ctx.globalAlpha = point.opacity

      if (i === 0) {
        ctx.moveTo(point.x, point.y)
      } else {
        const previousPoint = this._points[i - 1]
        ctx.moveTo(previousPoint.x, previousPoint.y)
        ctx.lineTo(point.x, point.y)
      }

      ctx.stroke()
    })
  }
}
