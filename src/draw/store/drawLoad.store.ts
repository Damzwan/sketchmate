import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ActiveSelection, Canvas, FabricObject, StaticCanvas } from 'fabric'
import { EventBus } from '@/main'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { centerObjectInViewport, precalculateAndSetViewport } from '@/draw/helpers/viewport.helper'
import { exportBoundingBoxImage } from '@/draw/helpers/export.helper'
import { v4 as uuidv4 } from 'uuid'
import { enlivenObjectsTimeSlivered, migrateLegacyOrigin } from '@/draw/helpers/drawload.helper'
import { createYielder } from '@/draw/helpers/yielding.helper'

export interface DrawingDraft {
  id: string;
  json: any;
  updatedAt: number;
  thumbnail: string;
}

/**
 * A draft whose save is in-flight. Surfaced reactively so the UI can render
 * a pending placeholder and disable interaction until the IDB write lands.
 */
export interface PendingDraft {
  id: string;
  updatedAt: number;
  thumbnail: string; // optimistic preview from the live canvas
  promise: Promise<void>;
}

/**
 * Decoupled-from-canvas snapshot. Holds *cloned* fabric objects plus the
 * canvas-level metadata needed to reconstruct a faithful render. Because
 * everything is cloned, the live Canvas may be disposed immediately after
 * snapshotting without affecting the in-flight save.
 */
interface CanvasSnapshot {
  draftId: string;
  version: any;
  backgroundColor: any;
  clipPath: any;
  backgroundImage: any;
  objects: FabricObject[]; // CLONED — safe to outlive the live canvas
  // Quick optimistic thumbnail captured synchronously from the live canvas.
  // Used until the proper offscreen render completes.
  optimisticThumb: string;
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

  // FIX: Track if the current session was loaded from a pre-existing local draft
  const isPreExistingDraft = ref(false)

  const pendingDrafts = ref<Map<string, PendingDraft>>(new Map())

  // --- Internal non-reactive refs ---
  let activeCanvas: Canvas | undefined
  let saveInterval: ReturnType<typeof setInterval> | undefined
  let liveAbortController: AbortController | undefined

  const SAVE_INTERVAL_MS = 20000
  const saveEvents = ['undo', 'redo', 'add_to_undo_stack', 'saveDrawing']

  // ==========================================
  // 💾 DATABASE
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
        request.onsuccess = (e) =>
          resolve((e.target as IDBOpenDBRequest).result)
        request.onerror = () => reject(new Error('Error opening IndexedDB'))
      })

    let database = await open()
    if (!validateSchema(database)) database = await open()
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

  // ==========================================
  // 📥 LOAD
  // ==========================================
  async function loadCanvas(
    c: Canvas,
    options: {
      isLobby: boolean;
      draftId?: string;
      canvasUrl?: string;
      json?: any;
    }
  ) {
    const finalId = options.draftId || currentDraftId.value || uuidv4()
    currentDraftId.value = finalId

    // Reset draft lineage tracking flag for the new workspace lifecycle
    isPreExistingDraft.value = false

    let json: any = null
    let isExternalLoad = false

    try {
      if (options.json) {
        json = options.json
        isExternalLoad = true
      } else if (options.canvasUrl) {
        const response = await fetch(options.canvasUrl)
        if (!response.ok) throw new Error('Failed to fetch remote canvas')
        const isGzipped =
          options.canvasUrl.endsWith('.gz') ||
          options.canvasUrl.endsWith('.gzip')
        if (isGzipped) {
          const ds = new DecompressionStream('gzip')
          const decompressedStream = response.body?.pipeThrough(ds)
          json = await new Response(decompressedStream).json()
        } else {
          json = await response.json()
        }
        isExternalLoad = true
      } else if (!options.isLobby && options.draftId) {
        await initDB()
        const draft = await getDraft(options.draftId)
        if (draft) {
          json = draft.json
          // FIX: Flag that this draft exists in IndexedDB storage
          isPreExistingDraft.value = true
        }
      }

      if (json) {
        if (json.objects && json.objects.length > 0) {
          json.objects = json.objects.map(migrateLegacyOrigin)
          precalculateAndSetViewport(c, json.objects)
        }

        if (json.version === '5.5.2') {
          delete json.width
          delete json.height
          json.objects = json.objects?.filter(
            (obj: any) => obj.id !== 'boundary'
          )
        }

        await actionWithoutEvents(async () => {
          c.clear()
          if (json.objects && json.objects.length > 0) {
            await enlivenObjectsTimeSlivered(json.objects, (obj) => {
              c.add(obj)
            })
          }
          if (json.version === '5.5.2' && c.getObjects().length > 0) {
            const selection = new ActiveSelection(c.getObjects(), {
              canvas: c
            })
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
          performLiveSave()
        }
      }
    } catch (error) {
      console.error('❌ loadCanvas Failed:', error)
    } finally {
      if (!isExternalLoad) isDirty.value = false
    }
  }

  async function snapshotCanvas(
    draftId: string,
    signal?: AbortSignal // Added signal parameter
  ): Promise<CanvasSnapshot | null> {
    if (!activeCanvas) return null
    const liveObjects = activeCanvas.getObjects()
    if (liveObjects.length === 0) return null

    let optimisticThumb = ''
    try {
      const el =
        (activeCanvas as any).lowerCanvasEl ??
        (activeCanvas as any).getElement?.()
      if (el && typeof el.toDataURL === 'function') {
        optimisticThumb = el.toDataURL('image/webp', 0.3)
      }
    } catch {
      /* non-fatal */
    }

    // FIX: Use yielder instead of Promise.all to prevent thread locking
    const objects: FabricObject[] = []
    const yielder = createYielder({ budgetMs: 6, signal })

    for (let i = 0; i < liveObjects.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      objects.push(await (liveObjects[i].clone() as Promise<FabricObject>))
      if (yielder.shouldYield()) await yielder.yield()
    }

    return {
      draftId,
      version: (activeCanvas as any).version,
      backgroundColor: activeCanvas.backgroundColor,
      clipPath: activeCanvas.clipPath,
      backgroundImage: activeCanvas.backgroundImage,
      objects,
      optimisticThumb
    }
  }

  async function runSave(
    snapshot: CanvasSnapshot,
    signal: AbortSignal
  ): Promise<void> {
    await initDB()
    if (!db.value) throw new Error('DB not available')
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const json: any = {
      version: snapshot.version,
      objects: [],
      background: snapshot.backgroundColor
    }
    if (snapshot.clipPath) {
      try {
        json.clipPath = snapshot.clipPath.toJSON()
      } catch {
        /* ignore */
      }
    }
    if (snapshot.backgroundImage) {
      try {
        json.backgroundImage = snapshot.backgroundImage.toJSON()
      } catch {
        /* ignore */
      }
    }

    const yielder = createYielder({ budgetMs: 6, signal })
    yielder.reset()
    for (let i = 0; i < snapshot.objects.length; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      try {
        json.objects.push(snapshot.objects[i].toJSON())
      } catch (e) {
        console.warn('[save] object toJSON failed, skipping:', e)
      }
      if (yielder.shouldYield()) await yielder.yield()
    }

    let thumbnail = snapshot.optimisticThumb
    let offscreen: StaticCanvas | null = null
    try {
      offscreen = new StaticCanvas(undefined, {
        backgroundColor: snapshot.backgroundColor,
        renderOnAddRemove: false,
        enableRetinaScaling: false
      })
      for (const obj of snapshot.objects) offscreen.add(obj)

      const exportResult = await exportBoundingBoxImage(offscreen as any, {
        maxSize: 300,
        asDataUrl: true,
        quality: 0.3,
        signal
      })
      if (exportResult?.img) thumbnail = exportResult.img as string
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.warn('[save] thumbnail render failed, using optimistic:', e)
      }
    } finally {
      try {
        offscreen?.dispose()
      } catch {
        /* ignore */
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

  async function performLiveSave() {
    if (
      !activeCanvas ||
      !currentDraftId.value ||
      !isDirty.value ||
      !hasContent()
    ) {
      return
    }
    if (liveAbortController) liveAbortController.abort()
    liveAbortController = new AbortController()
    const signal = liveAbortController.signal

    try {
      isSaving.value = true
      const snapshot = await snapshotCanvas(currentDraftId.value, signal) // Added signal
      if (!snapshot || signal.aborted) return
      await runSave(snapshot, signal)
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
    saveEvents.forEach((e) => EventBus.on(e, markAsDirty))
    saveInterval = setInterval(() => {
      if (isDirty.value) performLiveSave()
    }, SAVE_INTERVAL_MS)
  }

  function stopAutosave() {
    saveEvents.forEach((e) => EventBus.off(e, markAsDirty))
    if (saveInterval) clearInterval(saveInterval)
    if (liveAbortController) liveAbortController.abort()
  }

  const markAsDirty = () => (isDirty.value = true)

  async function queueBackgroundSave(
    draftId: string
  ): Promise<PendingDraft | null> {
    if (!hasContent()) return null

    if (liveAbortController) liveAbortController.abort()

    const ctrl = new AbortController()

    const snapshot = await snapshotCanvas(draftId, ctrl.signal)
    if (!snapshot) return null

    const promise = runSave(snapshot, ctrl.signal)
      .then(() => {
        pendingDrafts.value.delete(draftId)
        pendingDrafts.value = new Map(pendingDrafts.value)
      })
      .catch((e) => {
        // Ignore abort errors visually, log others
        if (e.name !== 'AbortError') console.error('🔥 Background save failed:', e)
        pendingDrafts.value.delete(draftId)
        pendingDrafts.value = new Map(pendingDrafts.value)
      })

    const pending: PendingDraft = {
      id: draftId,
      updatedAt: Date.now(),
      thumbnail: snapshot.optimisticThumb,
      promise
    }
    pendingDrafts.value.set(draftId, pending)
    pendingDrafts.value = new Map(pendingDrafts.value)
    return pending
  }

  const exitWithBackgroundSave = async (): Promise<PendingDraft | null> => {
    if (!currentDraftId.value) currentDraftId.value = uuidv4()
    if (!hasContent()) return null
    return await queueBackgroundSave(currentDraftId.value)
  }

  async function awaitPendingSaves(): Promise<void> {
    const promises = Array.from(pendingDrafts.value.values()).map(
      (p) => p.promise
    )
    if (promises.length === 0) return
    await Promise.allSettled(promises)
  }

  async function getDraft(id: string): Promise<DrawingDraft | undefined> {
    await initDB()
    return new Promise((resolve) => {
      const req = db
        .value!.transaction([objectStoreName], 'readonly')
        .objectStore(objectStoreName)
        .get(id)
      req.onsuccess = (e) => resolve((e.target as IDBRequest).result)
    })
  }

  async function removeDraft(id?: string): Promise<void> {
    const targetId = id || currentDraftId.value
    if (!targetId) return

    const pending = pendingDrafts.value.get(targetId)
    if (pending) {
      pendingDrafts.value.delete(targetId)
      pendingDrafts.value = new Map(pendingDrafts.value)
      try {
        await pending.promise
      } catch {
        /* ignore */
      }
    }

    await initDB()
    const tx = db.value!.transaction([objectStoreName], 'readwrite')
    tx.objectStore(objectStoreName).delete(targetId)
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(null)
      tx.onerror = () => reject(tx.error)
    })
  }

  async function getAllDrafts(): Promise<DrawingDraft[]> {
    await initDB()
    return new Promise((resolve) => {
      const req = db
        .value!.transaction([objectStoreName], 'readonly')
        .objectStore(objectStoreName)
        .getAll()
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
    isPreExistingDraft.value = false
  }

  const pendingDraftsList = computed<DrawingDraft[]>(() => {
    return Array.from(pendingDrafts.value.values()).map((p) => ({
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
    isPreExistingDraft, // Exported to be consumed by DrawExitGuard.vue
    pendingDrafts,
    pendingDraftsList,
    loadCanvas,
    startAutosave,
    stopAutosave,
    exitWithBackgroundSave,
    awaitPendingSaves,
    getDraft,
    removeDraft,
    getAllDrafts,
    hasContent,
    init,
    resetToNewDraft
  }
})
