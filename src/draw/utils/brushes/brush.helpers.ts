import * as fabric from 'fabric'
import { TSimplePathData } from 'fabric'

/**
 * Ensures that nested properties like clipPath and shadow are converted
 * from raw JSON objects into real Fabric class instances before
 * the parent object is instantiated.
 */
export async function enlivenStrokeProps(object: any): Promise<any> {
  // 1. Enliven the ClipPath (The culprit for the 'transform' error)
  if (object.clipPath && !(object.clipPath instanceof fabric.FabricObject)) {
    const enlivened = await fabric.util.enlivenObjects([object.clipPath])
    object.clipPath = enlivened[0]
  }

  // 2. Enliven the Shadow
  if (object.shadow && !(object.shadow instanceof fabric.Shadow)) {
    object.shadow = new fabric.Shadow(object.shadow)
  }

  return object
}

function getSqSegDist(px: number, py: number, p1x: number, p1y: number, p2x: number, p2y: number) {
  let x = p1x, y = p1y, dx = p2x - x, dy = p2y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = p2x; y = p2y; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

function simplifyDPStep(points: any[], first: number, last: number, sqTolerance: number, simplified: any[]) {
  let maxSqDist = sqTolerance, index = -1;

  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqSegDist(
      points[i].x, points[i].y,
      points[first].x, points[first].y,
      points[last].x, points[last].y
    );
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }

  if (index > -1) {
    if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
  }
}

export function simplifyPathDouglasPeucker(commands: TSimplePathData, tolerance: number): TSimplePathData {
  if (commands.length <= 2) return commands
  const sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1

  // Map SVG commands to actionable points (using the destination X, Y of each command)
  const points = commands.map(cmd => {
    const len = cmd.length
    return { x: cmd[len - 2] as number, y: cmd[len - 1] as number, cmd: cmd }
  })

  const last = points.length - 1
  const simplified = [points[0]] // Always keep the starting 'M'

  simplifyDPStep(points, 0, last, sqTolerance, simplified)

  simplified.push(points[last]) // Always keep the final point

  return simplified.map(p => p.cmd) as TSimplePathData
}