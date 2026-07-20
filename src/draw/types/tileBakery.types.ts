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

export interface BakeryResponse {
  msgId: number
  /** Rendered tile — transferred, zero-copy. */
  bitmap?: ImageBitmap
  /** Ids the mirror doesn't have (enliven failed / never upserted). */
  missing?: string[]
  error?: string
}
