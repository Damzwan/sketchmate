import { Canvas, FabricObject } from 'fabric'

export class Rect {
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number
  ) {
  }

  intersects(other: Rect): boolean {
    return !(
      other.x > this.x + this.w ||
      other.x + other.w < this.x ||
      other.y > this.y + this.h ||
      other.y + other.h < this.y
    )
  }

  contains(other: Rect): boolean {
    return (
      other.x >= this.x &&
      other.y >= this.y &&
      other.x + other.w <= this.x + this.w &&
      other.y + other.h <= this.y + this.h
    )
  }
}

export interface QuadtreeEntry<T> {
  id: string;
  bounds: Rect;
  __node?: Quadtree<T>;
}

export class Quadtree<T> {
  private objects: QuadtreeEntry<T>[] = []
  private divided = false

  private nw?: Quadtree<T>
  private ne?: Quadtree<T>
  private sw?: Quadtree<T>
  private se?: Quadtree<T>

  constructor(
    public readonly boundary: Rect,
    private readonly capacity = 8,
    private readonly depth = 0,
    private readonly maxDepth = 8
  ) {
  }

  private subdivide(): void {
    const { x, y, w, h } = this.boundary
    const hw = w / 2
    const hh = h / 2

    this.nw = new Quadtree(
      new Rect(x, y, hw, hh),
      this.capacity,
      this.depth + 1,
      this.maxDepth
    )
    this.ne = new Quadtree(
      new Rect(x + hw, y, hw, hh),
      this.capacity,
      this.depth + 1,
      this.maxDepth
    )
    this.sw = new Quadtree(
      new Rect(x, y + hh, hw, hh),
      this.capacity,
      this.depth + 1,
      this.maxDepth
    )
    this.se = new Quadtree(
      new Rect(x + hw, y + hh, hw, hh),
      this.capacity,
      this.depth + 1,
      this.maxDepth
    )

    this.divided = true
  }

  insert(entry: QuadtreeEntry<T>): boolean {
    if (!this.boundary.intersects(entry.bounds)) return false

    // If we are under capacity or maxDepth, store here
    if (this.objects.length < this.capacity || this.depth >= this.maxDepth) {
      this.objects.push(entry)
      entry.__node = this
      return true
    }

    if (!this.divided) this.subdivide()

    // Try to push into children only if fully contained
    const pushedToChild =
      (this.nw!.boundary.contains(entry.bounds) && this.nw!.insert(entry)) ||
      (this.ne!.boundary.contains(entry.bounds) && this.ne!.insert(entry)) ||
      (this.sw!.boundary.contains(entry.bounds) && this.sw!.insert(entry)) ||
      (this.se!.boundary.contains(entry.bounds) && this.se!.insert(entry))

    if (!pushedToChild) {
      // Overlaps multiple children: stay in this node
      this.objects.push(entry)
      entry.__node = this
    }

    return true
  }


  remove(entry: QuadtreeEntry<T>): boolean {
    const node = entry.__node
    if (!node) return false

    const idx = node.objects.indexOf(entry)
    if (idx !== -1) {
      node.objects.splice(idx, 1)
      entry.__node = undefined
      return true
    }

    return false
  }

  update(entry: QuadtreeEntry<T>): void {
    this.remove(entry)
    this.insert(entry)
  }

  query(range: Rect, found: QuadtreeEntry<T>[] = []): QuadtreeEntry<T>[] {
    if (!this.boundary.intersects(range)) {
      return found
    }
    for (const obj of this.objects) {
      if (range.intersects(obj.bounds)) {
        found.push(obj)
      }
    }
    if (this.divided) {
      this.nw!.query(range, found)
      this.ne!.query(range, found)
      this.sw!.query(range, found)
      this.se!.query(range, found)
    }
    return found
  }


  clear(): void {
    this.objects.length = 0

    if (this.divided) {
      this.nw!.clear()
      this.ne!.clear()
      this.sw!.clear()
      this.se!.clear()
    }

    this.divided = false
  }
}


export function fabricObjectToEntry(
  obj: FabricObject
): QuadtreeEntry<FabricObject> {
  const b = obj.getBoundingRect()

  return {
    id: obj.id,
    bounds: new Rect(b.left, b.top, b.width, b.height)
  }
}

export function getViewportRect(canvas: Canvas): Rect {
  const vpt = canvas.viewportTransform!
  const zoom = canvas.getZoom()

  return new Rect(
    -vpt[4] / zoom,
    -vpt[5] / zoom,
    canvas.getWidth() / zoom,
    canvas.getHeight() / zoom
  )
}
