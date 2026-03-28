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
  __nodes?: Quadtree<T>[]; // Must be an array
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

    this.nw = new Quadtree(new Rect(x, y, hw, hh), this.capacity, this.depth + 1, this.maxDepth)
    this.ne = new Quadtree(new Rect(x + hw, y, hw, hh), this.capacity, this.depth + 1, this.maxDepth)
    this.sw = new Quadtree(new Rect(x, y + hh, hw, hh), this.capacity, this.depth + 1, this.maxDepth)
    this.se = new Quadtree(new Rect(x + hw, y + hh, hw, hh), this.capacity, this.depth + 1, this.maxDepth)

    this.divided = true
  }

  insert(entry: QuadtreeEntry<T>): boolean {
    if (!this.boundary.intersects(entry.bounds)) return false

    // 1. If we have space, or hit max depth, store it in THIS node
    if (this.objects.length < this.capacity || this.depth >= this.maxDepth) {
      this.objects.push(entry)
      if (!entry.__nodes) entry.__nodes = []
      entry.__nodes.push(this) // Push this node to the array
      return true
    }

    if (!this.divided) this.subdivide()

    // 2. Try to push into children only if fully contained
    const pushedToChild =
      (this.nw!.boundary.contains(entry.bounds) && this.nw!.insert(entry)) ||
      (this.ne!.boundary.contains(entry.bounds) && this.ne!.insert(entry)) ||
      (this.sw!.boundary.contains(entry.bounds) && this.sw!.insert(entry)) ||
      (this.se!.boundary.contains(entry.bounds) && this.se!.insert(entry))

    // 3. Overlaps multiple children: stay in this parent node
    if (!pushedToChild) {
      this.objects.push(entry)
      if (!entry.__nodes) entry.__nodes = []
      entry.__nodes.push(this) // Push this node to the array
    }

    return true
  }

  remove(entry: QuadtreeEntry<T>): boolean {
    if (!entry.__nodes) return false

    // 1. Check if THIS node is in the entry's tracked nodes
    const nodeIdx = entry.__nodes.indexOf(this)
    if (nodeIdx !== -1) {
      // Untrack it
      entry.__nodes.splice(nodeIdx, 1)

      // 2. Remove the object from this node's internal array
      const objIdx = this.objects.findIndex(o => o.id === entry.id)
      if (objIdx !== -1) {
        this.objects.splice(objIdx, 1)
        return true
      }
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

export class InfiniteQuadtreeManager<T> {
  private chunks = new Map<string, Quadtree<T>>()

  constructor(
    private readonly chunkSize = 4096, // Tune this based on your average zoom level
    private readonly capacity = 8,
    private readonly maxDepth = 8
  ) {
  }

  // Helper to find all grid coordinates a rectangle overlaps
  private getOverlappingChunkKeys(bounds: Rect): string[] {
    const startX = Math.floor(bounds.x / this.chunkSize)
    const startY = Math.floor(bounds.y / this.chunkSize)
    const endX = Math.floor((bounds.x + bounds.w) / this.chunkSize)
    const endY = Math.floor((bounds.y + bounds.h) / this.chunkSize)

    const keys = []
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        keys.push(`${x},${y}`)
      }
    }
    return keys
  }

  insert(entry: QuadtreeEntry<T>) {
    const keys = this.getOverlappingChunkKeys(entry.bounds)

    for (const key of keys) {
      // If a chunk is drawn into for the first time, create a Quadtree for it
      if (!this.chunks.has(key)) {
        const [cx, cy] = key.split(',').map(Number)
        const chunkBounds = new Rect(
          cx * this.chunkSize,
          cy * this.chunkSize,
          this.chunkSize,
          this.chunkSize
        )
        this.chunks.set(key, new Quadtree(chunkBounds, this.capacity, 0, this.maxDepth))
      }

      this.chunks.get(key)!.insert(entry)
    }
  }

  update(entry: QuadtreeEntry<T>) {
    this.remove(entry)
    this.insert(entry)
  }

  remove(entry: QuadtreeEntry<T>) {
    // Because we updated __nodes to be an array, we just tell every node
    // that holds this object to remove it.
    if (entry.__nodes) {
      // Clone the array because the remove() method mutates it
      const nodesToClear = [...entry.__nodes]
      for (const node of nodesToClear) {
        node.remove(entry)
      }
    }
  }

  query(range: Rect): QuadtreeEntry<T>[] {
    const keys = this.getOverlappingChunkKeys(range)
    const foundMap = new Map<string, QuadtreeEntry<T>>() // Used to deduplicate

    for (const key of keys) {
      const chunk = this.chunks.get(key)
      if (chunk) {
        const items = chunk.query(range)
        // Deduplicate objects that span across multiple chunks
        for (const item of items) {
          foundMap.set(item.id, item)
        }
      }
    }

    return Array.from(foundMap.values())
  }

  clear(): void {
    for (const chunk of this.chunks.values()) {
      chunk.clear()
    }

    this.chunks.clear()
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
