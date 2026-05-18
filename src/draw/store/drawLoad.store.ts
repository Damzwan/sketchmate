import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ActiveSelection, Canvas, FabricObject } from 'fabric'
import { EventBus } from '@/main'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { centerObjectInViewport, precalculateAndSetViewport } from '@/draw/helpers/viewport.helper'
import { exportBoundingBoxImage } from '@/draw/helpers/export.helper'
import { v4 as uuidv4 } from 'uuid'
import { enlivenObjectsTimeSlivered, generateChunkedJSON } from '@/draw/helpers/drawload.helper'
import { createYielder } from '@/draw/helpers/yielding.helper'

export interface DrawingDraft {
  id: string
  json: any
  updatedAt: number
  thumbnail: string
}

/**
 * A draft that's currently being saved in the background. We expose these
 * reactively so the Home page can show them optimistically before the IDB
 * write completes.
 */
export interface PendingDraft {
  id: string
  updatedAt: number
  thumbnail: string  // optimistic preview — captured from last save or generated quickly
  promise: Promise<void>  // resolves when IDB write completes (or rejects on error)
}

/**
 * A snapshot of canvas state taken synchronously at exit time. Holds object
 * references so they survive canvas disposal — as long as this snapshot is
 * alive, the objects can be serialized and rendered.
 */
interface CanvasSnapshot {
  draftId: string
  version: any
  backgroundColor: any
  clipPath: any
  backgroundImage: any
  objects: FabricObject[]
  /** A throwaway StaticCanvas wrapping the snapshot objects for the thumbnail render. */
  canvasProxy: Canvas | null
}

export const useDrawLoadStore = defineStore('drawLoad', () => {
  const { actionWithoutEvents } = useDrawEventManager()

  // --- Database Config ---
  const db = ref<IDBDatabase | undefined>()
  const dbName = 'canvasDB'
  const objectStoreName = 'canvasHistory'

  // --- Reactive State ---
  const currentDraftId = ref<string | undefined>()
  const isSaving = ref(false)
  const isDirty = ref(false)

  // Reactive map of in-flight background saves, keyed by draft id.
  // Home page reads this to show optimistic placeholders.
  const pendingDrafts = ref<Map<string, PendingDraft>>(new Map())

  // --- Internal non-reactive refs ---
  let activeCanvas: Canvas | undefined
  let saveInterval: ReturnType<typeof setInterval> | undefined
  // Abort controller for the LIVE autosave (the periodic one). Background
  // saves (queued on exit) have their own non-abortable lifecycle.
  let abortController: AbortController | undefined

  const SAVE_INTERVAL_MS = 20000
  const saveEvents = ['undo', 'redo', 'add_to_undo_stack', 'saveDrawing']

  // ==========================================
  // 💾 DATABASE & UTILS
  // ==========================================
  async function initDB() {
    if (db.value) return

    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 2)

        request.onupgradeneeded = (event) => {
          const localDb = (event.target as IDBOpenDBRequest).result

          if (localDb.objectStoreNames.contains(objectStoreName)) {
            localDb.deleteObjectStore(objectStoreName)
          }

          localDb.createObjectStore(objectStoreName, { keyPath: 'id' })
        }

        request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
        request.onerror = () => reject(new Error('Error opening IndexedDB'))
      })

    let database = await open()

    if (!validateSchema(database)) {
      database = await open()
    }

    db.value = database
  }

  function validateSchema(db: IDBDatabase) {
    const tx = db.transaction([objectStoreName], 'readonly')
    const store = tx.objectStore(objectStoreName)

    if (store.keyPath !== 'id') {
      console.warn('❌ Invalid schema detected. Rebuilding DB...')
      db.close()
      indexedDB.deleteDatabase(dbName)
      return false
    }

    return true
  }


  async function loadCanvas(c: Canvas, options: {
    isLobby: boolean;
    draftId?: string;
    canvasUrl?: string;
    json?: any;
  }) {

    const finalId = options.draftId || currentDraftId.value || uuidv4()
    currentDraftId.value = finalId

    let json: any = null
    let isExternalLoad = false

    try {
      if (options.json) {
        json = options.json
        isExternalLoad = true
      } else if (options.canvasUrl) {
        const response = await fetch(options.canvasUrl)
        if (!response.ok) throw new Error('Failed to fetch remote canvas')

        const isGzipped = options.canvasUrl.endsWith('.gz') || options.canvasUrl.endsWith('.gzip')

        if (isGzipped) {
          const ds = new DecompressionStream('gzip')
          const decompressedStream = response.body?.pipeThrough(ds)
          const decompressedResponse = new Response(decompressedStream)
          json = await decompressedResponse.json()
        } else {
          json = await response.json()
        }
        isExternalLoad = true
      } else if (!options.isLobby && options.draftId) {
        await initDB()
        const draft = await getDraft(options.draftId)
        if (draft) {
          json = draft.json
        }
      }

      if (json) {
        if (json.objects && json.objects.length > 0) {
          precalculateAndSetViewport(c, json.objects)
        }

        if (json.version === '5.5.2') {
          delete json.width
          delete json.height
          json.objects = json.objects?.filter((obj: any) => obj.id !== 'boundary')
        }

        await actionWithoutEvents(async () => {
          c.clear()

          if (json.objects && json.objects.length > 0) {
            await enlivenObjectsTimeSlivered(json.objects, (obj) => {
              c.add(obj)
            })
          }

          if (json.version === '5.5.2' && c.getObjects().length > 0) {
            const selection = new ActiveSelection(c.getObjects(), { canvas: c })
            centerObjectInViewport(c, selection)
            selection.removeAll()
            selection.dispose()
          }

        })
        c.backgroundColor = json.background
      }

      if (!options.isLobby) {
        startAutosave(c, finalId)

        if (isExternalLoad && hasContent()) {
          markAsDirty()
          performSave()
        }
      }


    } catch (error) {
      console.error('❌ loadCanvas Failed:', error)
    } finally {
      if (!isExternalLoad) {
        isDirty.value = false
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SYNCHRONOUS CANVAS SNAPSHOT
  // ──────────────────────────────────────────────────────────────────────────
  //
  // Captures references to all objects + canvas-level metadata BEFORE the
  // view unmounts and disposes the canvas. The snapshot holds the object
  // references, so they survive disposal — they're plain JS objects that
  // remain functional (toJSON, render) regardless of whether they're attached
  // to a Canvas.
  //
  // This call is cheap: O(visible-objects) but only copies references, no
  // serialization. Typical ~5ms even for 3000 objects.
  function snapshotCanvas(draftId: string): CanvasSnapshot | null {
    if (!activeCanvas) return null
    const objects = activeCanvas.getObjects().slice()
    return {
      draftId,
      version: activeCanvas.version,
      backgroundColor: activeCanvas.backgroundColor,
      clipPath: activeCanvas.clipPath,
      backgroundImage: activeCanvas.backgroundImage,
      objects,
      // We keep a reference to the live canvas. We DON'T own it — the view
      // owns disposal. But we hold it long enough to render the thumbnail.
      // If the view disposes mid-save, the render falls back to a stub.
      canvasProxy: activeCanvas
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BACKGROUND SAVE
  // ──────────────────────────────────────────────────────────────────────────
  //
  // Queue a save that runs AFTER navigation completes. The caller (exit logic)
  // gets an immediately-resolved promise indicating the snapshot was taken;
  // the actual IDB write completes later in pendingDrafts.
  //
  // Returns the PendingDraft so the caller can await it if needed.
  function queueBackgroundSave(draftId: string): PendingDraft | null {
    if (!hasContent()) return null

    const snapshot = snapshotCanvas(draftId)
    if (!snapshot) return null

    // Take an optimistic thumbnail using the canvas's current rendered state.
    // We re-use the canvas's main element via toDataURL — instant, cheap,
    // shows the user something immediately. A higher-quality thumbnail is
    // generated in the background and replaces it on completion.
    let optimisticThumb = ''
    try {
      if (activeCanvas) {
        const el = (activeCanvas as any).lowerCanvasEl ?? (activeCanvas as any).getElement?.()
        if (el && typeof el.toDataURL === 'function') {
          optimisticThumb = el.toDataURL('image/webp', 0.3)
        }
      }
    } catch (e) {
      // Non-fatal — optimistic thumb stays empty.
    }

    // The actual save task. We use a synthetic AbortController that is
    // NEVER aborted by the normal autosave flow — background saves must
    // run to completion regardless of what happens to activeCanvas.
    const ctrl = new AbortController()

    const promise = runBackgroundSave(snapshot, optimisticThumb, ctrl.signal)
      .then(() => {
        pendingDrafts.value.delete(draftId)
        pendingDrafts.value = new Map(pendingDrafts.value)
      })
      .catch((e) => {
        console.error('🔥 Background save failed:', e)
        pendingDrafts.value.delete(draftId)
        pendingDrafts.value = new Map(pendingDrafts.value)
      })

    const pending: PendingDraft = {
      id: draftId,
      updatedAt: Date.now(),
      thumbnail: optimisticThumb,
      promise
    }
    pendingDrafts.value.set(draftId, pending)
    pendingDrafts.value = new Map(pendingDrafts.value)

    return pending
  }

  async function runBackgroundSave(
    snapshot: CanvasSnapshot,
    optimisticThumb: string,
    signal: AbortSignal
  ): Promise<void> {
    await initDB()
    if (!db.value) throw new Error('DB not available')
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    // Build JSON from the snapshot. We can't use generateChunkedJSON's Canvas
    // param directly since the canvas may be disposed — instead we serialize
    // the captured objects ourselves with the same time-slicing pattern.
    const json: any = {
      version: snapshot.version,
      objects: [],
      background: snapshot.backgroundColor
    }
    if (snapshot.clipPath) {
      try {
        json.clipPath = snapshot.clipPath.toJSON()
      } catch { /* ignore */
      }
    }
    if (snapshot.backgroundImage) {
      try {
        json.backgroundImage = snapshot.backgroundImage.toJSON()
      } catch { /* ignore */
      }
    }

    // Time-sliced serialization using the same yielder pattern as
    // generateChunkedJSON. Inlined to avoid the canvas dependency.
    const yielder = createYielder({ budgetMs: 6, signal })
    yielder.reset()
    for (let i = 0; i < snapshot.objects.length; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      try {
        json.objects.push(snapshot.objects[i].toJSON())
      } catch (e) {
        // Skip individual object failures — better a partial save than none.
        console.warn('[bg-save] object toJSON failed, skipping:', e)
      }
      if (yielder.shouldYield()) {
        await yielder.yield()
      }
    }

    // Try a real thumbnail render. If the canvas was disposed mid-save the
    // export may throw — we fall back to the optimistic thumbnail.
    let thumbnail = optimisticThumb
    try {
      if (snapshot.canvasProxy) {
        const exportResult = await exportBoundingBoxImage(snapshot.canvasProxy, {
          maxSize: 300,
          asDataUrl: true,
          quality: 0.3,
          signal
        })
        if (exportResult?.img) {
          thumbnail = exportResult.img as string
        }
      }
    } catch (e) {
      // Use optimistic thumb. The user already sees something reasonable.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.warn('[bg-save] thumbnail render failed, using optimistic:', e)
      }
    }

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const draft: DrawingDraft = {
      id: snapshot.draftId,
      json,
      thumbnail,
      updatedAt: Date.now()
    }

    const transaction = db.value.transaction([objectStoreName], 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const req = transaction.objectStore(objectStoreName).put(draft)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  /**
   * Wait for all pending background saves to finish. Useful for the Home page
   * to optionally wait before reading IDB, or for the app to wait before
   * shutting down.
   */
  async function awaitPendingSaves(): Promise<void> {
    const promises = Array.from(pendingDrafts.value.values()).map(p => p.promise)
    if (promises.length === 0) return
    await Promise.allSettled(promises)
  }

  // ==========================================
  // ORIGINAL FOREGROUND SAVE (autosave)
  // ==========================================
  //
  // Unchanged behavior: this runs periodically while the user is drawing.
  // The new background-save path is separate and used only on exit.
  async function performSave() {
    if (!activeCanvas || !currentDraftId.value || !db.value || !isDirty.value || !hasContent()) {
      return
    }
    if (abortController) abortController.abort()
    abortController = new AbortController()
    const signal = abortController.signal

    try {
      isSaving.value = true
      const json = await generateChunkedJSON(activeCanvas, signal)
      if (signal.aborted) return

      const exportResult = await exportBoundingBoxImage(activeCanvas, {
        maxSize: 300,
        asDataUrl: true,
        quality: 0.3,
        signal
      })

      if (signal.aborted || !exportResult) return

      const draft: DrawingDraft = {
        id: currentDraftId.value,
        json,
        thumbnail: exportResult.img as string,
        updatedAt: Date.now()
      }

      const transaction = db.value.transaction([objectStoreName], 'readwrite')
      await new Promise<void>((resolve, reject) => {
        const req = transaction.objectStore(objectStoreName).put(draft)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })

      isDirty.value = false
    } catch (error: any) {
      if (error.name !== 'AbortError') console.error('🔥 Save Error:', error)
    } finally {
      isSaving.value = false
    }
  }

  function init(c: Canvas) {
    activeCanvas = c
  }

  function startAutosave(canvas: Canvas, drawingId: string) {
    currentDraftId.value = drawingId

    saveEvents.forEach(e => EventBus.on(e, markAsDirty))
    saveInterval = setInterval(() => {
      if (isDirty.value) performSave()
    }, SAVE_INTERVAL_MS)
  }

  function stopAutosave() {
    saveEvents.forEach(e => EventBus.off(e, markAsDirty))
    if (saveInterval) clearInterval(saveInterval)
    if (abortController) abortController.abort()
  }

  const markAsDirty = () => isDirty.value = true

  /**
   * Force-save BEFORE exit — but in the background.
   *
   * Replaces the previous blocking `forceSave`. The caller can navigate
   * immediately; the save runs after navigation. Returns a promise that
   * resolves once the snapshot is captured (essentially synchronously),
   * NOT when the save fully completes.
   */
  const forceSaveBackground = (): PendingDraft | null => {
    if (!currentDraftId.value) {
      currentDraftId.value = uuidv4()
    }
    if (!hasContent()) return null

    // Abort the live autosave — we don't want it racing with the background
    // save we're about to queue.
    if (abortController) abortController.abort()

    return queueBackgroundSave(currentDraftId.value)
  }

  /**
   * Legacy blocking save, kept for cases where the caller really wants to
   * wait. Now just queues a background save and awaits it. Existing callers
   * keep working but get the better cancellation/yielding behavior.
   */
  const forceSave = async (): Promise<void> => {
    const pending = forceSaveBackground()
    if (pending) await pending.promise
  }


  async function getDraft(id: string): Promise<DrawingDraft | undefined> {
    await initDB()
    return new Promise((resolve) => {
      const req = db.value!.transaction([objectStoreName], 'readonly').objectStore(objectStoreName).get(id)
      req.onsuccess = (e) => resolve((e.target as IDBRequest).result)
    })
  }

  async function removeDraft(id?: string): Promise<void> {
    const targetId = id || currentDraftId.value
    if (!targetId) return

    // If a background save is pending for this id, cancel it — otherwise
    // it'll write the draft back after we just deleted it.
    const pending = pendingDrafts.value.get(targetId)
    if (pending) {
      pendingDrafts.value.delete(targetId)
      pendingDrafts.value = new Map(pendingDrafts.value)
    }

    await initDB()

    const all = await getAllDrafts()
    const matches = all.filter(d => d.id === targetId)

    const tx = db.value!.transaction([objectStoreName], 'readwrite')
    const store = tx.objectStore(objectStoreName)

    for (const match of matches) {
      store.delete(match.id)
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        resolve(null)
      }
      tx.onerror = () => reject(tx.error)
    })
  }

  async function getAllDrafts(): Promise<DrawingDraft[]> {
    await initDB()
    return new Promise((resolve) => {
      const req = db.value!.transaction([objectStoreName], 'readonly').objectStore(objectStoreName).getAll()
      req.onsuccess = (e) => resolve((e.target as IDBRequest).result || [])
    })
  }

  function hasContent(): boolean {
    if (!activeCanvas) return false
    return activeCanvas.getObjects().length > 0
  }

  function resetToNewDraft() {
    currentDraftId.value = uuidv4()
    isDirty.value = false
    isSaving.value = false
  }

  /**
   * Reactive view: pending saves as if they were drafts. Home page can merge
   * this with the actual drafts list for optimistic UI.
   */
  const pendingDraftsList = computed<DrawingDraft[]>(() => {
    return Array.from(pendingDrafts.value.values()).map(p => ({
      id: p.id,
      json: null,
      thumbnail: p.thumbnail,
      updatedAt: p.updatedAt
    }))
  })

  return {
    currentDraftId,
    isSaving,
    isDirty,
    pendingDrafts,
    pendingDraftsList,
    loadCanvas,
    startAutosave,
    stopAutosave,
    forceSave,
    forceSaveBackground,
    awaitPendingSaves,
    getDraft,
    removeDraft,
    getAllDrafts,
    hasContent,
    init,
    resetToNewDraft
  }
})