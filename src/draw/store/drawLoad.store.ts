import { ref } from 'vue'
import { defineStore } from 'pinia'
import { Canvas, ActiveSelection } from 'fabric'
import { EventBus } from '@/main'
import { yieldToMain } from '@/helper/general.helper'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { centerObjectInViewport } from '@/draw/helpers/viewport.helper'
import { exportBoundingBoxImage } from '@/draw/helpers/export.helper'
import { v4 as uuidv4 } from 'uuid'

export interface DrawingDraft {
  id: string
  json: any
  updatedAt: number
  thumbnail: string
}

export const useDrawLoadStore = defineStore('drawLoad', () => {
  const { actionWithoutEvents } = useDrawEventManager()
  const drawSyncer = useDrawSyncer()

  // --- Database Config ---
  const db = ref<IDBDatabase | undefined>()
  const dbName = 'canvasDB'
  const objectStoreName = 'canvasHistory'

  // --- Reactive State ---
  const currentDraftId = ref<string | undefined>() // 🚀 Added: The source of truth
  const isSaving = ref(false)
  const isDirty = ref(false)

  // --- Internal non-reactive refs ---
  let activeCanvas: Canvas | undefined
  let saveInterval: ReturnType<typeof setInterval> | undefined
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

  async function generateChunkedJSON(canvas: Canvas, signal: AbortSignal) {
    const json: any = {
      version: canvas.version,
      objects: [],
      background: canvas.backgroundColor
    }
    if (canvas.clipPath) json.clipPath = canvas.clipPath.toJSON()
    if (canvas.backgroundImage) json.backgroundImage = canvas.backgroundImage.toJSON()

    const objects = canvas.getObjects()
    const TIME_BUDGET_MS = 8
    let frameStartTime = performance.now()

    for (let i = 0; i < objects.length; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      json.objects.push(objects[i].toJSON())

      if (performance.now() - frameStartTime > TIME_BUDGET_MS) {
        await yieldToMain()
        frameStartTime = performance.now()
      }
    }
    return json
  }


  async function loadCanvas(c: Canvas, options: {
    isLobby: boolean;
    draftId?: string;
    canvasUrl?: string;
    json?: any;
  }) {
    drawSyncer.isLoadingCanvas = true

    const finalId = options.draftId || currentDraftId.value || uuidv4()
    currentDraftId.value = finalId

    let json: any = null
    let isExternalLoad = false

    try {
      if (options.json) {
        json = options.json
        isExternalLoad = true
      }

      // --- REMOTE SOURCE ---
      else if (options.canvasUrl) {
        const response = await fetch(options.canvasUrl)
        if (!response.ok) throw new Error('Failed to fetch remote canvas')

        // Note: check for .gz or .gzip depending on your naming convention
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
      }


      // --- LOCAL SOURCE (IndexedDB) ---
      else if (!options.isLobby && options.draftId) {
        await initDB()
        const draft = await getDraft(options.draftId)
        if (draft) {
          json = draft.json
        }
      }

      // --- APPLY DATA TO CANVAS ---
      if (json) {
        // Logic for legacy version cleaning
        if (json.version === '5.5.2') {
          delete json.width
          delete json.height
          json.objects = json.objects?.filter((obj: any) => obj.id !== 'boundary')
        }

        await actionWithoutEvents(async () => {
          c.clear()
          await c.loadFromJSON(json)

          if (json.version === '5.5.2' && c.getObjects().length > 0) {
            const selection = new ActiveSelection(c.getObjects(), { canvas: c })
            centerObjectInViewport(c, selection)
            selection.removeAll()
            selection.dispose()
          }
        })
      }

      if (!options.isLobby) {
        startAutosave(c, finalId)

        // Force background save if data came from outside the local DB
        if (isExternalLoad && hasContent()) {
          markAsDirty()
          performSave()
        }
      }

    } catch (error) {
      console.error('❌ loadCanvas Failed:', error)
    } finally {
      drawSyncer.isLoadingCanvas = false
      if (!isExternalLoad) {
        isDirty.value = false
      }
    }
  }

  // ==========================================
  // 📤 SAVING
  // ==========================================
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

  function startAutosave(canvas: Canvas, drawingId: string) {
    activeCanvas = canvas
    currentDraftId.value = drawingId // 🚀 Ensure it's in sync

    saveEvents.forEach(e => EventBus.on(e, markAsDirty))
    saveInterval = setInterval(() => {
      if (isDirty.value) performSave()
    }, SAVE_INTERVAL_MS)
  }

  function stopAutosave() {
    saveEvents.forEach(e => EventBus.off(e, markAsDirty))
    if (saveInterval) clearInterval(saveInterval)
    if (abortController) abortController.abort()
    // Note: We usually don't clear currentDraftId here to allow forceSave on exit
  }

  const markAsDirty = () => isDirty.value = true
  const forceSave = async () => {
    if (!currentDraftId.value) {
      currentDraftId.value = uuidv4()
    }

    if (hasContent()) {
      markAsDirty()
      await performSave()
    }
  }

  // ==========================================
  // 🗄️ DB ACCESSORS
  // ==========================================
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

  return {
    currentDraftId,
    isSaving,
    isDirty,
    loadCanvas,
    startAutosave,
    stopAutosave,
    forceSave,
    getDraft,
    removeDraft,
    getAllDrafts,
    hasContent
  }
})