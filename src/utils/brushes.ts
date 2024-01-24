import { fabric } from 'fabric'
import { InkBrush } from '@/utils/brushes/inkbrush'
import { PatternBrush, Point } from 'fabric/fabric-impl'
import paperTexture from '@/assets/textures/paper2.jpg'
import { opacityFromOpacityHex } from '@/helper/draw/draw.helper'

declare module 'fabric' {
  namespace fabric {
    interface Canvas {
      contextTop: CanvasRenderingContext2D
    }

    interface IUtil {
      trimCanvas: (c: HTMLCanvasElement) => { x: number; y: number }
      colorValues: (color: string) => number[] | undefined
      getRandom: (max: number, min?: number) => number
      clamp: (n: number, max: number, min?: number) => number
    }

    interface Point {
      angleBetween(p: Point): number

      normalize(p: number): Point
    }


    interface BaseBrush {
      convertToImg: () => void
      canvas: Canvas
    }

    class InkBrush {
      constructor(canvas: Canvas)
    }

    class WaterColorBrush extends PatternBrush {
      source: any

      constructor(canvas: Canvas)
    }

    class Stroke {
      constructor(
        ctx: CanvasRenderingContext2D,
        pointer: fabric.Point,
        range: number,
        color: string,
        lineWidth: number,
        inkAmount: number
      )

      update: (pointer: fabric.Point, subtractPoint: fabric.Point, distance: number) => void
      draw: () => void
    }
  }
}

export function loadAdditionalBrushes() {
  fabric.util.trimCanvas = function(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    let w = canvas.width
    let h = canvas.height
    const pix: any = { x: [], y: [] }
    let n: number
    const imageData = ctx.getImageData(0, 0, w, h)
    const fn = (a: number, b: number) => a - b

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (imageData.data[(y * w + x) * 4 + 3] > 0) {
          pix.x.push(x)
          pix.y.push(y)
        }
      }
    }
    pix.x.sort(fn)
    pix.y.sort(fn)
    // eslint-disable-next-line prefer-const
    n = pix.x.length - 1

    //if (n == -1) {
    //	// Nothing to trim... empty canvas?
    //}

    w = pix.x[n] - pix.x[0]
    h = pix.y[n] - pix.y[0]
    if (!pix.x[0] || !pix.y[0] || !w || !h) return { x: 0, y: 0 }
    const cut = ctx.getImageData(pix.x[0], pix.y[0], w, h)

    canvas.width = w
    canvas.height = h
    ctx.putImageData(cut, 0, 0)

    return { x: pix.x[0], y: pix.y[0] }
  }

  /**
   * Extract r,g,b,a components from any valid color.
   * Returns {undefined} when color cannot be parsed.
   *
   * @param {number} color Any color string (named, hex, rgb, rgba)
   * @returns {(Array|undefined)} Example: [0,128,255,1]
   * @see https://gist.github.com/oriadam/396a4beaaad465ca921618f2f2444d49
   */
  fabric.util.colorValues = function(color: string): number[] | undefined {
    if (!color) {
      return
    }
    if (color.toLowerCase() === 'transparent') {
      return [0, 0, 0, 0]
    }
    if (color[0] === '#') {
      if (color.length < 7) {
        // convert #RGB and #RGBA to #RRGGBB and #RRGGBBAA
        color =
          '#' +
          color[1] +
          color[1] +
          color[2] +
          color[2] +
          color[3] +
          color[3] +
          (color.length > 4 ? color[4] + color[4] : '')
      }
      return [
        parseInt(color.substr(1, 2), 16),
        parseInt(color.substr(3, 2), 16),
        parseInt(color.substr(5, 2), 16),
        color.length > 7 ? parseInt(color.substr(7, 2), 16) / 255 : 1
      ]
    }
    if (color.indexOf('rgb') === -1) {
      // convert named colors
      const tempElem = document.body.appendChild(document.createElement('fictum')) // intentionally use unknown tag to lower chances of css rule override with !important
      const flag = 'rgb(1, 2, 3)' // this flag tested on chrome 59, ff 53, ie9, ie10, ie11, edge 14
      tempElem.style.color = flag
      if (tempElem.style.color !== flag) {
        return // color set failed - some monstrous css rule is probably taking over the color of our object
      }
      tempElem.style.color = color
      if (tempElem.style.color === flag || tempElem.style.color === '') {
        return // color parse failed
      }
      color = getComputedStyle(tempElem).color
      document.body.removeChild(tempElem)
    }
    if (color.indexOf('rgb') === 0) {
      if (color.indexOf('rgba') === -1) {
        color += ',1' // convert 'rgb(R,G,B)' to 'rgb(R,G,B)A' which looks awful but will pass the regxep below
      }
      return color.match(/[.\d]+/g)!.map(a => +a)
    }
  }

  fabric.Point.prototype.angleBetween = function(that: fabric.Point): number {
    return Math.atan2(this.x - that.x, this.y - that.y)
  }

  fabric.Point.prototype.normalize = function(thickness?: number): fabric.Point {
    if (null === thickness || undefined === thickness) {
      thickness = 1
    }

    const length = this.distanceFrom({ x: 0, y: 0 })

    if (length > 0) {
      this.x = (this.x / length) * thickness
      this.y = (this.y / length) * thickness
    }

    return this
  }

  /**
   * Convert a brush drawing on the upperCanvas to an image on the fabric canvas.
   * This makes the drawing editable, it can be moved, rotated, scaled, skewed etc.
   */
  fabric.BaseBrush.prototype.convertToImg = function(this: any): void {
    const pixelRatio = this.canvas.getRetinaScaling()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const c = fabric.util.copyCanvasElement(this.canvas.upperCanvasEl)
    const xy = fabric.util.trimCanvas(c)
    const img = new fabric.Image(c)

    img
      .set({ left: xy.x / pixelRatio, top: xy.y / pixelRatio, scaleX: 1 / pixelRatio, scaleY: 1 / pixelRatio })
      .setCoords()
    this.canvas.add(img).clearContext(this.canvas.contextTop)
    this.canvas.clearContext(this.canvas.contextTop)
  }

  fabric.util.getRandom = function(max: number, min?: number): number {
    min = min ? min : 0
    return Math.random() * ((max ? max : 1) - min) + min
  }

  fabric.util.clamp = function(n: number, max: number, min?: number): number {
    if (typeof min !== 'number') {
      min = 0
    }
    return n > max ? max : n < min ? min : n
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  fabric.Stroke = fabric.util.createClass(fabric.Object, {
    color: null,
    inkAmount: null,
    lineWidth: null,

    _point: null,
    _lastPoint: null,
    _currentLineWidth: null,

    initialize: function(
      ctx: CanvasRenderingContext2D,
      pointer: fabric.Point,
      range: number,
      color: string,
      lineWidth: number,
      inkAmount: number
    ) {
      const rx = fabric.util.getRandom(range)
      const c = fabric.util.getRandom(Math.PI * 2)
      const c0 = fabric.util.getRandom(Math.PI * 2)
      const x0 = rx * Math.sin(c0)
      const y0 = (rx / 2) * Math.cos(c0)
      const cos = Math.cos(c)
      const sin = Math.sin(c)

      this.ctx = ctx
      this.color = color
      this._point = new fabric.Point(pointer.x + x0 * cos - y0 * sin, pointer.y + x0 * sin + y0 * cos)
      this.lineWidth = lineWidth
      this.inkAmount = inkAmount
      this._currentLineWidth = lineWidth

      ctx.lineCap = 'round'
    },

    update: function(pointer: fabric.Point, subtractPoint: fabric.Point, distance: number): void {
      this._lastPoint = fabric.util.object.clone(this._point)
      this._point = this._point.addEquals({ x: subtractPoint.x, y: subtractPoint.y })

      const n = this.inkAmount / (distance + 1)
      const per = n > 0.3 ? 0.2 : n < 0 ? 0 : n
      this._currentLineWidth = this.lineWidth * per
    },

    draw: function(): void {
      const ctx = this.ctx
      ctx.save()
      this.line(ctx, this._lastPoint, this._point, this.color, this._currentLineWidth)
      ctx.restore()
    },

    line: function(
      ctx: CanvasRenderingContext2D,
      point1: fabric.Point,
      point2: fabric.Point,
      color: string,
      lineWidth: number
    ): void {
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(point1.x, point1.y)
      ctx.lineTo(point2.x, point2.y)
      ctx.stroke()
    }
  })

  fabric.InkBrush = InkBrush

  const paperTextureImg = new Image()
  paperTextureImg.src = paperTexture // Path to your grayscale watercolor texture

  fabric.WaterColorBrush = fabric.util.createClass(fabric.PatternBrush, {
    getPatternSrc: function() {
      const patternCanvas = fabric.util.createCanvasElement(),
        patternCtx = patternCanvas.getContext('2d')

      patternCanvas.width = patternCanvas.height = 256

      if (patternCtx) {
        // Directly draw the water texture as a background
        patternCtx.drawImage(paperTextureImg, 0, 0, patternCanvas.width, patternCanvas.height)

        const solidColor = this.color.slice(0, -2)
        const currentAlpha = parseInt(this.color.slice(-2), 16) / 255 // Convert the hex alpha to a ratio (0 to 1)
        Math.max(currentAlpha - 0.3, 0.6)
        Math.max(currentAlpha - 0.6, 0.3)
        const reducedAlphaHex1 = Math.round(0.7 * 255)
          .toString(16)
          .padStart(2, '0') // Convert it back to hex
        const reducedAlphaHex = Math.round(0.4 * 255)
          .toString(16)
          .padStart(2, '0') // Convert it back to hex

        const reducedAlphaColor1 = `${solidColor}${reducedAlphaHex1}`
        const reducedAlphaColor = `${solidColor}${reducedAlphaHex}`

        const gradient = patternCtx.createRadialGradient(
          patternCanvas.width / 2,
          patternCanvas.height / 2,
          0,
          patternCanvas.width / 2,
          patternCanvas.height / 2,
          patternCanvas.width / 2
        )
        gradient.addColorStop(0, reducedAlphaColor1)
        gradient.addColorStop(1, reducedAlphaColor)

        patternCtx.fillStyle = gradient
        patternCtx.globalCompositeOperation = 'multiply'
        patternCtx.fillRect(0, 0, patternCanvas.width, patternCanvas.height)
        patternCtx.globalCompositeOperation = 'source-over'
      }
      return patternCanvas
    },
    getPattern: function(ctx: CanvasRenderingContext2D) {
      return ctx.createPattern(this.getPatternSrc(), 'repeat')
    },
    createPath: function(pathData: any) {
      const path = this.callSuper('createPath', pathData),
        topLeft = path._getLeftTopCoords().scalarAdd(path.strokeWidth / 2)

      path.stroke = new fabric.Pattern({
        source: this.getPatternSrc(),
        offsetX: -topLeft.x,
        offsetY: -topLeft.y
      })

      path.opacity = opacityFromOpacityHex(this.color)
      return path
    },
    _render: function() {
      const ctx = this.canvas.contextTop
      let p1 = this._points[0],
        p2 = this._points[1]
      this._saveAndTransform(ctx)
      ctx.beginPath()
      ctx.globalAlpha = opacityFromOpacityHex(this.color)

      if (this._points.length === 2 && p1.x === p2.x && p1.y === p2.y) {
        const width = this.width / 1000
        p1.x -= width
        p2.x += width
      }
      ctx.moveTo(p1.x, p1.y)

      for (let i = 1; i < this._points.length; i++) {
        this.drawSegment(ctx, p1, p2)
        p1 = this._points[i]
        p2 = this._points[i + 1]
      }

      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
      ctx.restore()
    },
    drawSegment: function(ctx: CanvasRenderingContext2D, p1: Point, p2: Point) {
      const midPoint = p1.midPointFrom(p2)
      ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y)
      return midPoint
    },
    onMouseMove: function(pointer: Point, { e }: any) {
      pointer = new fabric.Point(pointer.x, pointer.y)
      if (!this.canvas._isMainEvent(e)) {
        return
      }
      this.drawStraightLine = !!this.straightLineKey && e[this.straightLineKey]
      if (this.limitedToCanvasSize === true && this._isOutSideCanvas(pointer)) {
        return
      }
      const addedPoints = this._addPoint(pointer)
      if (addedPoints.length > 0 && this._points.length > 1) {
        if (this.needsFullRender()) {
          this.canvas.clearContext(this.canvas.contextTop)
          this._render()
        } else {
          const points = this._points,
            length = points.length,
            ctx = this.canvas.contextTop
          // draw the curve update
          this._saveAndTransform(ctx)
          if (this.oldEnd) {
            ctx.beginPath()
            ctx.moveTo(this.oldEnd.x, this.oldEnd.y)
          }
          for (let i = 0; i < addedPoints.length - 1; i++) {
            this.oldEnd = this.drawSegment(ctx, addedPoints[i], addedPoints[i + 1])
          }
          ctx.stroke()
          ctx.restore()
        }
      }
    },
    addJaggednessBetweenPoints: function(p1: Point, p2: Point) {
      const numberOfJaggedPoints = 4 // You can adjust this as per your needs
      const jaggedPoints = []

      for (let i = 1; i <= numberOfJaggedPoints; i++) {
        const t = i / (numberOfJaggedPoints + 1)
        const interpolatedX = p1.x + t * (p2.x - p1.x)
        const interpolatedY = p1.y + t * (p2.y - p1.y)

        const deviation = 5 // Adjust this value as per your needs
        const jaggedX = interpolatedX + (Math.random() - 0.5) * deviation
        const jaggedY = interpolatedY + (Math.random() - 0.5) * deviation

        jaggedPoints.push(new fabric.Point(jaggedX, jaggedY))
      }

      return jaggedPoints
    },
    _addPoint: function(point: Point) {
      const addedPoints = []

      if (!(this._points.length > 1 && point.eq(this._points[this._points.length - 1]))) {
        if (this.drawStraightLine && this._points.length > 1) {
          this._hasStraightLine = true
          this._points.pop()
        }

        // If the previous point exists
        if (this._points.length > 0) {
          const previousPoint = this._points[this._points.length - 1]

          // Get jagged points between the previous point and the new point
          const jaggedPoints = this.addJaggednessBetweenPoints(previousPoint, point)

          // Insert the jagged points into _points array
          this._points.push(...jaggedPoints)
          addedPoints.push(...jaggedPoints)
        }

        this._points.push(point)
        addedPoints.push(point)
      }

      return addedPoints
    }
  })
}
