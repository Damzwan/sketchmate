import { PatternBrush, Canvas, Path, Pattern, Point } from 'fabric'
import * as fabric from 'fabric'

export class CrayonBrush extends PatternBrush {
  private _cachedPatternCanvas?: HTMLCanvasElement
  private _lastColor?: string

  constructor(canvas: Canvas) {
    super(canvas)
    this.decimate = 0
  }

  needsFullRender() { return true }
  _needsFullRender() { return true }

  getPatternSrc(): HTMLCanvasElement {
    if (this._cachedPatternCanvas && this._lastColor === this.color) {
      return this._cachedPatternCanvas
    }
    const patternCanvas = document.createElement('canvas')
    const ctx = patternCanvas.getContext('2d')!
    const size = 32
    patternCanvas.width = patternCanvas.height = size
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = this.color
      ctx.globalAlpha = Math.random() * 0.6 + 0.1
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 2)
    }
    this._cachedPatternCanvas = patternCanvas
    this._lastColor = this.color
    return patternCanvas
  }

  getPattern(ctx: CanvasRenderingContext2D) {
    return ctx.createPattern(this.getPatternSrc(), 'repeat')
  }

  createPath(pathData: fabric.util.TSimplePathData): Path {
    const path = super.createPath(pathData)
    path.objectCaching = false
    const topLeft = path._getLeftTopCoords().scalarAdd(path.strokeWidth / 2)
    path.stroke = new Pattern({
      source: this.getPatternSrc(),
      offsetX: -topLeft.x,
      offsetY: -topLeft.y
    })
    path.strokeLineCap = 'round'
    path.strokeLineJoin = 'round'
    return path
  }

  // Override Fabric's PencilBrush/PatternBrush onMouseUp so we add the path and
  // fire path:created WITHOUT the trailing canvas.requestRenderAll() that the
  // base implementation does. That render paints the object on the lower canvas
  // OUTSIDE the tile pipeline → the ghost/flicker every other brush had. The
  // tile engine repaints from path:created instead.
  onMouseUp(o: { e: any }): boolean {
    // mirror the base guard for multi-touch / non-main button if your build uses it
    if (!this.canvas._isMainEvent?.(o.e)) return true
    this._finalizeAndAddPath()
    return false
  }

  // Reimplement the commit body without the render. This mirrors what
  // PencilBrush._finalizeAndAddPath does minus requestRenderAll.
  private _finalizeAndAddPath(): void {
    const ctx = this.canvas.contextTop
    ctx.closePath()

    // decimate=0, so use the raw points; base uses this.decimatePoints/_points
    if (this.decimate) {
      this._points = (this as any).decimatePoints(this._points, this.decimate)
    }
    const pathData = (this as any).convertPointsToSVGPath(this._points)

    if ((this as any)._isEmptySVGPath?.(pathData) ?? pathData.length === 0) {
      // nothing drawn — clear the preview and bail, no render
      this.canvas.clearContext(this.canvas.contextTop)
      this._reset?.()
      return
    }

    const path = this.createPath(pathData)

    this.canvas.clearContext(this.canvas.contextTop)
    this.canvas.fire('before:path:created', { path })
    this.canvas.add(path)
    this.canvas.fire('path:created', { path })
    // NOTE: deliberately NO this.canvas.requestRenderAll() here.

    this._reset?.()
  }
}