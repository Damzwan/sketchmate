// tileBakery.types.ts — protocol between tileBakery.service (main) and
// tileBakery.worker. Deltas keep the worker's fabric mirror in sync; bake
// requests carry only tile geometry + z-ordered ids.

export type BakeryRequest =
  | { t: 'config'; liveMax?: number }
  | { t: 'upsert'; items: { id: string; json: any }[] }
  | { t: 'translate'; ids: string[]; dx: number; dy: number }
  | { t: 'remove'; ids: string[] }
  | { t: 'clear' }
  | {
      t: 'bake'
      msgId: number
      ids: string[]
      world: { x: number; y: number; w: number; h: number }
      scale: number
      overscan: number
      size: number
    }
  | {
      // Whole-board low-res render (the WorldOverview base layer). `ids` are
      // z-ordered and already bbox-filtered main-side; the worker renders them
      // into a px×px bitmap mapped to `bounds`.
      t: 'overview'
      msgId: number
      ids: string[]
      bounds: { x: number; y: number; w: number; h: number }
      px: number
      scale: number
    }

export interface BakeryResponse {
  /** Correlates with the request. -1 marks an UNSOLICITED notification (the
   *  font-registration result), which no pending request is waiting on. */
  msgId: number
  /** Rendered tile — transferred, zero-copy. */
  bitmap?: ImageBitmap
  /** Ids the mirror doesn't have (enliven failed / never upserted). */
  missing?: string[]
  error?: string
  /** Font families successfully registered in the worker's FontFaceSet. Text
   *  using any OTHER family stays refused — a missing face would silently bake
   *  fallback glyphs into a committed tile. Empty = no worker font support. */
  fonts?: string[]
}
