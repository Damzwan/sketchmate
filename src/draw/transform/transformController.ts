import { Canvas, FabricObject, InteractiveFabricObject } from 'fabric'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'

interface Refs {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
}

interface Origin {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Session {
  canvas: Canvas;
  objects: FabricObject[];
  target: FabricObject;
  savedOpacity: number[];
  bitmap: ImageBitmap;
  origin: Origin;
  refs: Refs;
  baseZoom: number;
  moveHappened: boolean;
  rafId: number | null;
}

interface CachedBake {
  bitmap: ImageBitmap;
  origin: Origin;
  state: {
    id: string | null; // selection identity — two targets can share shape+zoom
    scaleX: number;
    scaleY: number;
    angle: number;
    width: number;
    height: number;
    zoom: number;
  };
}

let session: Session | null = null
let cachedBake: CachedBake | null = null
const ownedIds = new Set<string>()

// The GPU drag layer (one per canvas instance, reused across sessions).
let layerCanvas: HTMLCanvasElement | null = null

// ─── Public API ──────────────────────────────────────────────────────────────

export function isActive(): boolean {
  return session !== null
}

export function moveHappened(): boolean {
  return session?.moveHappened ?? false
}

export function activeObjects(): readonly FabricObject[] {
  return session?.objects ?? []
}

/** True while the controller "owns" this object (manager skips its tile patches
 *  until commit AND through the post-commit bake, via persisted ownedIds). */
export function ownsObject(id: string): boolean {
  return ownedIds.has(id)
}

export function ownsTarget(obj: FabricObject): boolean {
  if (session && obj === session.target) return true
  const id = (obj as any).id
  return !!id && ownedIds.has(id)
}

/** Called on mouse:down on a target. Reuses the current session if the same
 *  selection is being grabbed again (no re-bake, no re-punch). */
export function beginOrContinue(c: Canvas, target: FabricObject): void {
  const objs = isActiveSelection(target)
    ? [...(target as any)._objects]
    : [target]

  if (session) {
    if (sameSet(session.objects, objs)) {
      session.target = target
      const zoom = c.viewportTransform![0]
      if (Math.abs(zoom - session.baseZoom) > 1e-4) rebaseline(c, session)
      return
    }
    commit(c) // different selection → flush the old one first
  }
  beginNew(c, target, objs)
}

/** First frame the user actually moves. Hide originals, DROP the original
 *  footprint from the tile cache ONCE, then reveal the GPU layer. */
export function markMoved(): void {
  if (!session || session.moveHappened) return
  session.moveHappened = true
  const s = session

  s.objects.forEach((o) => (o.opacity = 0))

  // Light drop: full dropRegion() sync-rebuilt up to 32 tiles on the first
  // move frame (and invalidated our own bitmap cache). Bounded sync repair +
  // overview fallback is enough — the GPU layer shows the selection.
  const mgr = useDrawObjectManager()
  mgr.dropRegionLight({
    x: s.origin.left,
    y: s.origin.top,
    w: s.origin.width,
    h: s.origin.height
  })

  const el = ensureLayer(s.canvas)
  el.style.display = 'block'
  applyTransform(s)
  renderControls(s.canvas)
}

/** Coalesced per-frame update — just a GPU transform write + cheap controls. */
export function schedule(): void {
  if (!session) return
  if (session.rafId !== null) return
  session.rafId = requestAnimationFrame(() => {
    if (!session) return
    session.rafId = null
    applyTransform(session)
    renderControls(session.canvas)
  })
}

/** mouse:up — keep the session floating; do NOT commit to tiles. */
export function releaseDrag(c: Canvas): void {
  if (!session) return
  const s = session
  if (s.rafId !== null) {
    cancelAnimationFrame(s.rafId)
    s.rafId = null
  }
  if (s.moveHappened) {
    applyTransform(s)
    renderControls(c)
  }
  // commit() performs the setCoords + quadtree refresh — doing it here as
  // well ran the whole O(N) loop twice per release.
  commit(c)
}

/** The selection is really finished with. Repaint tiles ONCE and tear down. */
export function commit(c: Canvas): void {
  if (!session) return
  const s = session
  session = null
  // DO NOT clear ownedIds here — let ownership persist through the bake so the
  // manager keeps skipping this object's own modified-events until tiles land.
  if (s.rafId !== null) cancelAnimationFrame(s.rafId)

  const el = layerCanvas

  if (s.moveHappened) {
    const mgr = useDrawObjectManager()

    // 1. Refresh layout FIRST so the quadtree has the NEW position before we
    //    invalidate (otherwise the old-region drop could re-capture the object).
    s.target.setCoords()
    for (const o of s.objects) {
      o.setCoords()
      mgr.updateQuadTree(o)
    }

    // 2. Restore opacity at the new position.
    s.objects.forEach((o, i) => (o.opacity = s.savedOpacity[i]))

    // 3. DROP the OLD footprint (object has left it) → correct empty overview,
    //    never a sharp stale-exact ghost. Bounded sync repair only — the full
    //    ≤32-tile sync rebuild was the release-frame freeze on big selections.
    mgr.dropRegionLight({
      x: s.origin.left,
      y: s.origin.top,
      w: s.origin.width,
      h: s.origin.height
    })

    // 4. Mark the NEW footprint dirty (stale-exact OK — the GPU layer covers it
    //    until the tiles are baked).
    const tb = s.target.getBoundingRect()
    const PAD = 8
    const newRect = {
      x: tb.left - PAD,
      y: tb.top - PAD,
      w: tb.width + PAD * 2,
      h: tb.height + PAD * 2
    }
    mgr.scheduleRectPatch(newRect)

    // 5. Stamp the drag-layer pixels straight into the tiles at the new
    //    position: the commit costs O(touched tiles) drawImage instead of
    //    re-rendering N objects, and the result is pixel-identical to what
    //    the layer already shows. Tiles are stored stale — the scheduled
    //    bake repaints them exactly (correct z where the selection sits
    //    under other content) without any visible change.
    let stamped = false
    if (c.viewportTransform![0] === s.baseZoom) {
      try {
        stamped = mgr.stampRegionBitmap(newRect, s.bitmap, bitmapToWorldMatrix(s))
      } catch { /* bitmap closed / detached — fall back to the bake cover */ }
    }

    const elRef = el
    const idsToClear = new Set(ownedIds)

    if (stamped) {
      // Tiles already show the exact layer pixels — hide immediately.
      if (elRef) elRef.style.display = 'none'
      idsToClear.forEach((id) => ownedIds.delete(id))
      renderControls(c)
    } else {
      // 5b. Fallback: hide the GPU layer only once the NEW position has
      //     actually baked (or zoom changed, which invalidates the layer
      //     coords), then release ownership. 1s safety cap so it can never
      //     stick.
      const start = performance.now()

      const hideWhenReady = () => {
        if (session) return // a new drag took over the layer

        const currentZoom = c.viewportTransform![0]
        if (
          currentZoom !== s.baseZoom ||
          mgr.isRegionBaked(newRect) ||
          performance.now() - start > 1000
        ) {
          if (elRef) elRef.style.display = 'none'
          idsToClear.forEach((id) => ownedIds.delete(id))
          renderControls(c)
        } else {
          requestAnimationFrame(hideWhenReady)
        }
      }
      requestAnimationFrame(hideWhenReady)
    }
  } else {
    if (el) el.style.display = 'none'
    s.target.setCoords()
    ownedIds.clear()
    renderControls(c)
  }
}

export function cancel(c: Canvas): void {
  commit(c)
}

export function invalidateCache(): void {
  if (cachedBake?.bitmap) cachedBake.bitmap.close()
  cachedBake = null
}

// ─── Session setup ───────────────────────────────────────────────────────────

function beginNew(c: Canvas, target: FabricObject, objs: FabricObject[]): void {
  // No unconditional invalidateCache here — bakeSelectionBitmap validates the
  // cache against identity + shape + zoom, so re-grabbing an unchanged
  // selection is an instant cache hit instead of N sync object renders.
  // Content changes invalidate via handleStyleChange / erasing:end /
  // selection events.
  const baked = bakeSelectionBitmap(c, target)
  if (!baked) return

  session = {
    canvas: c,
    objects: objs,
    target,
    savedOpacity: objs.map((o) => o.opacity ?? 1),
    bitmap: baked.bitmap,
    origin: baked.origin,
    refs: {
      left: target.left ?? 0,
      top: target.top ?? 0,
      scaleX: target.scaleX ?? 1,
      scaleY: target.scaleY ?? 1,
      angle: target.angle ?? 0
    },
    baseZoom: c.viewportTransform![0],
    moveHappened: false,
    rafId: null
  }
  for (const o of objs) if (o.id) ownedIds.add(o.id)

  placeLayer(c, session)
  if (layerCanvas) layerCanvas.style.display = 'none'
}

/** Re-bake at the current state/zoom and reset the reference frame to "now". */
function rebaseline(c: Canvas, s: Session): void {
  const t = s.target
  const restore = s.objects.map((o) => o.opacity)
  s.objects.forEach((o, i) => (o.opacity = s.savedOpacity[i]))
  invalidateCache()
  const baked = bakeSelectionBitmap(c, t)
  s.objects.forEach((o, i) => (o.opacity = s.moveHappened ? 0 : restore[i]))
  if (!baked) return

  s.bitmap = baked.bitmap
  s.origin = baked.origin
  s.refs = {
    left: t.left ?? 0,
    top: t.top ?? 0,
    scaleX: t.scaleX ?? 1,
    scaleY: t.scaleY ?? 1,
    angle: t.angle ?? 0
  }
  placeLayer(c, s)
  if (s.moveHappened && layerCanvas) {
    layerCanvas.style.display = 'block'
    applyTransform(s)
  }
}

// ─── GPU layer ───────────────────────────────────────────────────────────────

function ensureLayer(c: Canvas): HTMLCanvasElement {
  const wrapper = (c as any).wrapperEl as HTMLElement
  const upper = (c as any).upperCanvasEl as HTMLElement

  if (layerCanvas && layerCanvas.parentElement === wrapper) return layerCanvas

  const el = document.createElement('canvas')
  el.className = 'fabric-drag-layer'
  Object.assign(el.style, {
    position: 'absolute',
    top: '0px',
    left: '0px',
    transformOrigin: '0 0',
    pointerEvents: 'none',
    willChange: 'transform',
    display: 'none'
  } as Partial<CSSStyleDeclaration>)
  wrapper.insertBefore(el, upper)
  layerCanvas = el
  return el
}

function placeLayer(c: Canvas, s: Session): void {
  const el = ensureLayer(c)

  if (el.width !== s.bitmap.width || el.height !== s.bitmap.height) {
    el.width = s.bitmap.width
    el.height = s.bitmap.height
  }
  const ctx = el.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.drawImage(s.bitmap, 0, 0)
  }

  const vpt = c.viewportTransform!
  const zoom = vpt[0]
  s.baseZoom = zoom

  el.style.left = `${s.origin.left * zoom + vpt[4]}px`
  el.style.top = `${s.origin.top * zoom + vpt[5]}px`
  el.style.width = `${s.origin.width * zoom}px`
  el.style.height = `${s.origin.height * zoom}px`

  const pivotPxX = (s.refs.left - s.origin.left) * zoom
  const pivotPxY = (s.refs.top - s.origin.top) * zoom
  el.style.transformOrigin = `${pivotPxX}px ${pivotPxY}px`
  el.style.transform = 'none'
}

function applyTransform(s: Session): void {
  const el = layerCanvas
  if (!el) return
  const t = s.target
  const zoom = s.baseZoom

  const sx = (t.scaleX ?? 1) / s.refs.scaleX
  const sy = (t.scaleY ?? 1) / s.refs.scaleY
  const angle = (t.angle ?? 0) - s.refs.angle
  const tx = ((t.left ?? 0) - s.refs.left) * zoom
  const ty = ((t.top ?? 0) - s.refs.top) * zoom

  el.style.transform = `translate(${tx}px, ${ty}px) rotate(${angle}deg) scale(${sx}, ${sy})`
}

const MAX_CHILD_BORDERS = 30

function renderControls(c: Canvas): void {
  const upper = (c as any).upperCanvasEl as HTMLCanvasElement
  const ctx = c.getTopContext()
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, upper.width, upper.height)
  ctx.restore()
  const active = c.getActiveObject()
  if (!active) return
  const childCount = isActiveSelection(active)
    ? ((active as any)._objects?.length ?? 0)
    : 0
  if (childCount > MAX_CHILD_BORDERS) {
    InteractiveFabricObject.prototype._renderControls.call(active as any, ctx)
  } else {
    (active as any)._renderControls(ctx)
  }
}

// ─── Bitmap baking (cached; keyed on shape + zoom, NOT position) ─────────────

function bakeSelectionBitmap(
  c: Canvas,
  target: FabricObject
): { bitmap: ImageBitmap; origin: Origin } | null {
  const PAD = 8
  const b = target.getBoundingRect()
  const zoom = c.viewportTransform![0]

  const curState = {
    id: ((target as any).id as string | undefined) ?? null,
    scaleX: target.scaleX ?? 1,
    scaleY: target.scaleY ?? 1,
    angle: target.angle ?? 0,
    width: target.width ?? 0,
    height: target.height ?? 0,
    zoom
  }

  if (cachedBake) {
    const s = cachedBake.state
    if (
      s.id !== null &&
      s.id === curState.id &&
      s.scaleX === curState.scaleX &&
      s.scaleY === curState.scaleY &&
      s.angle === curState.angle &&
      s.width === curState.width &&
      s.height === curState.height &&
      s.zoom === curState.zoom
    ) {
      return {
        bitmap: cachedBake.bitmap,
        origin: {
          left: b.left - PAD,
          top: b.top - PAD,
          width: cachedBake.origin.width,
          height: cachedBake.origin.height
        }
      }
    }
    invalidateCache()
  }

  const minX = b.left - PAD
  const minY = b.top - PAD
  const worldW = b.width + PAD * 2
  const worldH = b.height + PAD * 2
  if (worldW <= 0 || worldH <= 0) return null

  const dpr = window.devicePixelRatio || 1
  let scale = zoom * dpr

  const childCount = isActiveSelection(target)
    ? (target as any)._objects?.length || 1
    : 1
  if (childCount > 150) scale *= 0.5
  else if (childCount > 50) scale *= 0.75

  let physW = Math.ceil(worldW * scale)
  let physH = Math.ceil(worldH * scale)

  const MAX_DIM = 2048
  if (physW > MAX_DIM || physH > MAX_DIM) {
    const factor = Math.min(MAX_DIM / physW, MAX_DIM / physH)
    physW = Math.max(1, Math.floor(physW * factor))
    physH = Math.max(1, Math.floor(physH * factor))
    scale *= factor
  }

  const off = new OffscreenCanvas(physW, physH)
  const ctx = off.getContext('2d', { alpha: true })
  if (!ctx) return null
  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)

  if (isActiveSelection(target)) {
    const zMap = useDrawObjectManager().getZIndexMap();
    (target as any)._objects?.sort(
      (a: FabricObject, b2: FabricObject) =>
        (zMap.get(a) ?? 0) - (zMap.get(b2) ?? 0)
    )
  }

  try {
    target.render(ctx as any)
  } catch (err) {
    console.warn('[transformController] bake render failed', err)
  }

  let bitmap: ImageBitmap
  try {
    bitmap = off.transferToImageBitmap()
  } catch {
    return null
  }

  const origin: Origin = {
    left: minX,
    top: minY,
    width: worldW,
    height: worldH
  }
  cachedBake = { bitmap, origin, state: curState }
  return { bitmap, origin }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

type Mat = [number, number, number, number, number, number]

function mul(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}

/**
 * bitmap px → CURRENT world coords. Mirrors the CSS layer transform exactly:
 * bitmap px → bake-time world (origin box), then the delta transform about
 * the refs pivot (what applyTransform writes as CSS).
 */
function bitmapToWorldMatrix(s: Session): Mat {
  const t = s.target
  const rad = (((t.angle ?? 0) - s.refs.angle) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const sx = (t.scaleX ?? 1) / s.refs.scaleX
  const sy = (t.scaleY ?? 1) / s.refs.scaleY

  let m: Mat = [1, 0, 0, 1, t.left ?? 0, t.top ?? 0]
  m = mul(m, [cos, sin, -sin, cos, 0, 0])
  m = mul(m, [sx, 0, 0, sy, 0, 0])
  m = mul(m, [1, 0, 0, 1, -s.refs.left, -s.refs.top])
  m = mul(m, [1, 0, 0, 1, s.origin.left, s.origin.top])
  return mul(m, [
    s.origin.width / s.bitmap.width, 0,
    0, s.origin.height / s.bitmap.height,
    0, 0
  ])
}

function isActiveSelection(t: FabricObject): boolean {
  return (t.type || '').toLowerCase() === 'activeselection'
}

function sameSet(a: FabricObject[], b: FabricObject[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  for (const o of b) if (!set.has(o)) return false
  return true
}