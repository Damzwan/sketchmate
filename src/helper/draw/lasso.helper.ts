import { fabric } from 'fabric'

export function downSampleCircle(circle: fabric.Circle, numberOfPoints = 30): number[][] {
  // Get the circle's center, radius, and scale
  const cx = (circle.left || 0) + circle.radius!
  const cy = (circle.top || 0) + circle.radius!
  const r = circle.radius || 0
  const scaleX = circle.scaleX || 1
  const scaleY = circle.scaleY || 1

  // Create an array of points around the circle's perimeter
  const points = Array.from({ length: numberOfPoints }, (_, i) => {
    // Get the angle of this point
    const theta = (i / numberOfPoints) * 2 * Math.PI

    // Calculate the point's coordinates, taking the scale into account
    const x = cx + r * Math.cos(theta) * scaleX
    const y = cy + r * Math.sin(theta) * scaleY

    return [x, y]
  })

  return points
}

export function downSampleEllipse(ellipse: fabric.Ellipse, numberOfPoints = 30): number[][] {
  // Get the ellipse's center, radii, and scale
  const cx = (ellipse.left || 0) + ellipse.rx!
  const cy = (ellipse.top || 0) + ellipse.ry!
  const rx = ellipse.rx || 0
  const ry = ellipse.ry || 0
  const scaleX = ellipse.scaleX || 1
  const scaleY = ellipse.scaleY || 1

  // Create an array of points around the ellipse's perimeter
  const points = Array.from({ length: numberOfPoints }, (_, i) => {
    // Get the angle of this point
    const theta = (i / numberOfPoints) * 2 * Math.PI

    // Calculate the point's coordinates, taking the scale into account
    const x = cx + rx * Math.cos(theta) * scaleX
    const y = cy + ry * Math.sin(theta) * scaleY

    return [x, y]
  })

  return points
}

export function createPointRepresentationForBoundingRect(obj: fabric.Object) {
  const coords = obj.getCoords()
  const points = []

  // Generate grid points within bounding box
  const resolution = 15 // Change this to increase or decrease point count
  const minX = Math.min(coords[0].x, coords[1].x, coords[2].x, coords[3].x)
  const maxX = Math.max(coords[0].x, coords[1].x, coords[2].x, coords[3].x)
  const minY = Math.min(coords[0].y, coords[1].y, coords[2].y, coords[3].y)
  const maxY = Math.max(coords[0].y, coords[1].y, coords[2].y, coords[3].y)

  for (let x = minX; x <= maxX; x += resolution) {
    for (let y = minY; y <= maxY; y += resolution) {
      points.push([x, y])
    }
  }

  return points
}
