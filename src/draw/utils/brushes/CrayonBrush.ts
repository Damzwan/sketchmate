import { PatternBrush, Canvas, Path, Pattern } from 'fabric'
import * as fabric from 'fabric'

export class CrayonBrush extends PatternBrush {
  private _cachedPatternCanvas?: HTMLCanvasElement
  private _lastColor?: string

  constructor(canvas: Canvas) {
    super(canvas)
    // TREATMENT 1: Disable path smoothing to preserve raw micro-movements
    this.decimate = 0
  }

  // TREATMENT 2: Disable incremental segment drawing.
  // Forces Fabric to safely wipe and redraw the entire continuous stroke every frame,
  // eliminating alpha accumulation during slow micro-movements while preserving zoom/pan.
  needsFullRender() {
    return true
  }

  // (Included as a safety net for complete compatibility with older Fabric versions)
  _needsFullRender() {
    return true
  }

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
}