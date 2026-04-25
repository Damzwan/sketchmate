import * as fabric from 'fabric'
import { ActiveSelection, Canvas, FabricObject, Point } from 'fabric'
import { defineStore } from 'pinia'
import { svgPathProperties } from 'svg-path-properties'
import inside from 'point-in-polygon'
import { DrawTool, FabricEvent, ToolService } from '@/draw/types/draw.types'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { isMobile } from '@/helper/general.helper'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { Rect } from '@/draw/utils/QuadTree'

type FabricObjectWithCache = FabricObject & { _lassoPoints?: number[][] }

export const useLasso = defineStore('lasso', (): ToolService => {
  let c: Canvas | undefined = undefined
  let upperCtx: CanvasRenderingContext2D | null = null

  let isDrawing = false
  let rafId: number | null = null
  let lassoPolygonPoints: number[][] = []
  let lassoBBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  let pendingPointer: { x: number; y: number } | null = null
  let ghostHighlighted: FabricObject[] = []

  const events: FabricEvent[] = [
    { on: 'mouse:down', handler: onMouseDown },
    { on: 'mouse:move', handler: onMouseMove },
    { on: 'mouse:up', handler: onMouseUp },
  ]

  function init(canvas: Canvas) {
    c = canvas
    upperCtx = (c as any).upperCanvasEl?.getContext('2d') ?? null
    c.on('object:modified', (opt) => {
      if (opt.target) (opt.target as FabricObjectWithCache)._lassoPoints = undefined
    })
  }

  // ─── Drawing helpers ─────────────────────────────────────────────────────────

  function renderOverlay(highlightedObjects: FabricObject[]) {
    if (!upperCtx || !c) return
    const el = (c as any).upperCanvasEl as HTMLCanvasElement
    const vpt = c.viewportTransform as number[]
    const retina = c.getRetinaScaling()

    upperCtx.clearRect(0, 0, el.width, el.height)
    upperCtx.save()
    upperCtx.setTransform(
      vpt[0] * retina,
      vpt[1] * retina,
      vpt[2] * retina,
      vpt[3] * retina,
      vpt[4] * retina,
      vpt[5] * retina
    )

    // 1. Draw the Lasso Path
    if (lassoPolygonPoints.length > 1) {
      upperCtx.beginPath()
      upperCtx.moveTo(lassoPolygonPoints[0][0], lassoPolygonPoints[0][1])
      for (let i = 1; i < lassoPolygonPoints.length; i++) {
        upperCtx.lineTo(lassoPolygonPoints[i][0], lassoPolygonPoints[i][1])
      }
      upperCtx.closePath()
      upperCtx.fillStyle = 'rgba(0, 150, 255, 0.1)'
      upperCtx.fill()
      upperCtx.strokeStyle = '#007bff'
      upperCtx.lineWidth = 1.5 / vpt[0]
      upperCtx.setLineDash([5 / vpt[0], 5 / vpt[0]])
      upperCtx.stroke()
    }

    // 2. Draw "Ghost" highlights with Padding
    // padding is visually constant (e.g., 4px) regardless of zoom
    const padding = 4 / vpt[0]
    upperCtx.fillStyle = 'rgba(0, 123, 255, 0.35)'

    highlightedObjects.forEach(obj => {
      if (!upperCtx) return
      const coords = obj.getCoords() // [tl, tr, br, bl]

      // Calculate a center point to push coordinates outward
      const center = obj.getCenterPoint()

      upperCtx.beginPath()
      coords.forEach((p, i) => {
        // Move the point away from the center by the padding amount
        const dx = p.x - center.x
        const dy = p.y - center.y
        const dist = Math.hypot(dx, dy) || 1

        const px = p.x + (dx / dist) * padding
        const py = p.y + (dy / dist) * padding

        if (i === 0) upperCtx!.moveTo(px, py)
        else upperCtx!.lineTo(px, py)
      })

      upperCtx.closePath()
      upperCtx.fill()
    })

    upperCtx.restore()
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function onMouseDown(o: any) {
    if (!isMobile() && o.e.button !== 0) return
    isDrawing = true
    const pointer = c!.getScenePoint(o.e)
    lassoPolygonPoints = [[pointer.x, pointer.y]]
    lassoBBox = { minX: pointer.x, minY: pointer.y, maxX: pointer.x, maxY: pointer.y }
  }

  function onMouseMove(o: any) {
    if (!isDrawing) return
    pendingPointer = c!.getScenePoint(o.e)
    if (rafId === null) rafId = requestAnimationFrame(processMove)
  }

  function processMove() {
    rafId = null
    if (!isDrawing || !pendingPointer) return
    const { x, y } = pendingPointer

    const last = lassoPolygonPoints[lassoPolygonPoints.length - 1]
    if (Math.hypot(x - last[0], y - last[1]) < 5) return

    lassoPolygonPoints.push([x, y])
    lassoBBox.minX = Math.min(lassoBBox.minX, x); lassoBBox.minY = Math.min(lassoBBox.minY, y)
    lassoBBox.maxX = Math.max(lassoBBox.maxX, x); lassoBBox.maxY = Math.max(lassoBBox.maxY, y)

    const { query } = useDrawObjectManager()
    const rect = new Rect(lassoBBox.minX, lassoBBox.minY, lassoBBox.maxX - lassoBBox.minX, lassoBBox.maxY - lassoBBox.minY)
    const candidates = query(rect) as FabricObject[]

    ghostHighlighted = candidates.filter(obj => {
      const pts = getPointRepresentation(obj)
      return isInsideLasso(pts, lassoPolygonPoints, obj)
    })

    renderOverlay(ghostHighlighted)
  }

  function onMouseUp() {
    isDrawing = false
    if (rafId) cancelAnimationFrame(rafId)
    rafId = null

    const el = (c as any).upperCanvasEl as HTMLCanvasElement
    upperCtx?.clearRect(0, 0, el.width, el.height)

    if (ghostHighlighted.length > 0) {
      applyFinalSelection(ghostHighlighted)
    }

    lassoPolygonPoints = []
    ghostHighlighted = []
    c?.requestRenderAll()
  }

  // ─── Logic ───────────────────────────────────────────────────────────────────

  function isInsideLasso(pts: number[][], poly: number[][], obj: FabricObject): boolean {
    if (pts.length === 0) return false

    const visualWidth = obj.width! * obj.scaleX!
    const visualHeight = obj.height! * obj.scaleY!
    if (visualWidth < 10 && visualHeight < 10) {
      const center = obj.getCenterPoint()
      return inside([center.x, center.y], poly)
    }

    const insideCount = pts.reduce((acc, p) => acc + (inside(p, poly) ? 1 : 0), 0)
    return (insideCount / pts.length) >= 0.85
  }

  function getPointRepresentation(obj: FabricObjectWithCache): number[][] {
    // @ts-ignore
    if (obj.type === 'path' || obj.path) {
      return getPathPoints(obj as fabric.Path)
    }
    const coords = obj.getCoords().map(p => [p.x, p.y])
    const center = obj.getCenterPoint()
    coords.push([center.x, center.y])
    return coords
  }

  function getPathPoints(path: fabric.Path & { _lassoPoints?: number[][] }): number[][] {
    if (path._lassoPoints) return path._lassoPoints
    if (!path.path || path.path.length === 0) return []

    try {
      const pathString = path.path.map(cmd => cmd.join(' ')).join(' ')
      const properties = new svgPathProperties(pathString)
      const totalLength = properties.getTotalLength()
      const matrix = path.calcTransformMatrix()
      const points: number[][] = []

      if (totalLength < 20) {
        path.path.forEach((cmd: any) => {
          if (cmd.length >= 3) {
            const rawP = new Point(cmd[cmd.length - 2] - path.pathOffset.x, cmd[cmd.length - 1] - path.pathOffset.y)
            const transP = fabric.util.transformPoint(rawP, matrix)
            points.push([transP.x, transP.y])
          }
        })
      } else {
        const numPoints = 12
        const step = totalLength / numPoints
        for (let i = 0; i <= totalLength; i += step) {
          const p = properties.getPointAtLength(i)
          const corrected = new Point(p.x - path.pathOffset.x, p.y - path.pathOffset.y)
          const transformed = fabric.util.transformPoint(corrected, matrix)
          points.push([transformed.x, transformed.y])
        }
      }

      path._lassoPoints = points
      return points
    } catch { return [] }
  }

  function applyFinalSelection(objects: FabricObject[]) {
    const { selectTool } = useToolSelection()
    selectTool(DrawTool.Select)
    if (objects.length > 1) {
      c!.setActiveObject(new ActiveSelection(objects, { canvas: c }))
    } else {
      c!.setActiveObject(objects[0])
    }
  }

  async function select() {
    if (!c) return
    c.selection = false
    c.skipTargetFind = true
    c.defaultCursor = 'crosshair'
  }

  return { select, events, init }
})