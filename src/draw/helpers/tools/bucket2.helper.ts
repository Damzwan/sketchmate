import { Canvas, Polygon } from 'fabric'
import { CustomFloodFill } from '@/draw/utils/CustomFloodFill'
import { createDownScaledCanvas } from './bucket.helper'
import { usePen } from '@/draw/store/tools/pen.store'
import { hex2RGBA } from '@/draw/utils/color.utils'
// @ts-ignore
import { contours } from 'd3-contour'
import { Path } from 'fabric'

type Point = { x: number, y: number }

export async function bucketFill2(c: Canvas, p: Point, scale = 1) {
  const { brushColorWithOpacity } = usePen()
  const dpr = window.devicePixelRatio || 1

  const downscaledCanvas = createDownScaledCanvas(c, scale)
  const downscaledCtx = downscaledCanvas.getContext('2d')

  const imgData = downscaledCtx!.getImageData(0, 0, downscaledCanvas.width, downscaledCanvas.height)
  const brushColor = brushColorWithOpacity()

  const floodFill = new CustomFloodFill(imgData)
  floodFill.fill(brushColor, Math.round(p.x * dpr * scale), Math.round(p.y * dpr * scale), 10)

  // Get the modified image data (the raster mask)
  const modifiedImgData = floodFill.getModifiedImageData(hex2RGBA(brushColor))

  if (floodFill.modifiedPixelsCount === 0) return null

  // --- START VECTORIZATION ---
  const width = modifiedImgData.width
  const height = modifiedImgData.height
  const data = modifiedImgData.data

  // 1. Convert pixel data into a flat array of 1s (solid) and 0s (transparent)
  const values = new Float32Array(width * height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    values[j] = data[i + 3] > 0 ? 1 : 0 // Check the alpha channel
  }

  // 2. Generate the topological contours
  const contourGenerator = contours().size([width, height]).thresholds([0.5])
  const contourData = contourGenerator(values)

  // If no polygons were generated, abort
  if (contourData.length === 0 || contourData[0].coordinates.length === 0) return null

  // 3. Build the SVG Path String
  let svgPath = ''
  const multiPolygon = contourData[0].coordinates

  const vpt = c.viewportTransform!
  const offsetX = vpt[4]
  const offsetY = vpt[5]
  const zoom = c.getZoom()
  const trueScale = 1 / (scale * dpr)

  // multiPolygon is a deeply nested array: Polygon[] -> Ring[] -> Point[]
  for (const polygon of multiPolygon) {
    for (const ring of polygon) {

      let lastX = -99999, lastY = -99999 // Track last added point

      for (let i = 0; i < ring.length; i++) {
        const pt = ring[i]

        // Map the downscaled pixel coordinates straight back to absolute Canvas coordinates
        const x = (pt[0] * trueScale - offsetX) / zoom
        const y = (pt[1] * trueScale - offsetY) / zoom

        // --- THE SPEED FIX: POINT SIMPLIFICATION ---
        // Skip intermediate points that are virtually sitting on top of the last point.
        // This stops Fabric from rendering useless geometry.
        if (i > 0 && i < ring.length - 1) {
          const distSq = (x - lastX) * (x - lastX) + (y - lastY) * (y - lastY)
          // If the point is less than 1 pixel squared away from the last point, toss it
          if (distSq < 1.0) continue
        }

        if (i === 0) {
          svgPath += `M ${x} ${y} ` // Move to start
        } else {
          svgPath += `L ${x} ${y} ` // Draw line
        }

        // Update last recorded point
        lastX = x
        lastY = y
      }
      svgPath += 'Z ' // Close the ring
    }
  }

  if (!svgPath) return null

  const modifiedArea = floodFill.getModifiedArea()

  // 4. Create the native Fabric Path
  const vectorFill = new Path(svgPath, {
    fill: brushColor,
    isBucketFill: true,
    left: ((modifiedArea.minX + modifiedArea.width / 2) / (scale * dpr) - offsetX) / c.getZoom(),
    top: ((modifiedArea.minY + (modifiedArea.height / 2)) / (scale * dpr) - offsetY) / c.getZoom(),
    objectCaching: false, // Keeps it perfectly crisp at any zoom level

    // THIS IS THE MAGIC BULLET FOR HOLES:
    fillRule: 'evenodd'
  })

  return vectorFill
}