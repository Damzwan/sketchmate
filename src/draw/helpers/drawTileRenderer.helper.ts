// src/draw/helpers/drawTileRenderer.helper.ts
import { FabricObject } from 'fabric'

export const isolatedTileRenderer = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  obj: FabricObject
) => {
  obj.visible = true


  const origCaching = obj.objectCaching
  obj.objectCaching = false

  // Do NOT force obj.dirty / clipPath.dirty here. Objects with a ClippingGroup
  // are force-cached by fabric (needsItsOwnCache); forcing dirty made every
  // tile render re-rasterize the whole clip stack — the super-linear erase
  // lag. Real mutations (set(), commitErasing) already flag dirty themselves,
  // so the cache re-renders exactly once per change and is drawImage'd after.

  // THE FIX: Since we kept obj.canvas attached, Fabric will attempt to cull
  // the object if it is off-screen relative to the MAIN canvas viewport.
  // Because we are baking background tiles, we must forcefully bypass this!
  const origIsOnScreen = obj.isOnScreen
  obj.isOnScreen = () => true

  ctx.save()
  try {
    obj.render(ctx as CanvasRenderingContext2D)
  } catch (err) {
    console.warn('[TileRenderer] Draw failed:', err)
  } finally {
    ctx.restore()

    // Restore original states so the live layer behaves normally
    obj.objectCaching = origCaching
    obj.isOnScreen = origIsOnScreen
  }
}