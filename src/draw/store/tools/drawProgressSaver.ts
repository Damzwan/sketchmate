import { isCanvasHealthy } from '../../helpers/healthChecker.helper'
import { EventBus } from '@/main'
import { Canvas } from 'fabric'

export function useDrawProgressSaver() {
  let c: Canvas | undefined
  const events = ['undo', 'redo', 'add_to_undo_stack', 'saveDrawing']

  const dbName = 'canvasDB'
  const objectStoreName = 'canvasHistory'
  let db: IDBDatabase | undefined
  const fixedKey = 1

  let saveTimeout: ReturnType<typeof setTimeout> | undefined
  let idleCallbackId: number | undefined

  async function init(c: Canvas) {
    if (db) return

    try {
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName)

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const localDb = (event.target as IDBOpenDBRequest).result
          if (!localDb.objectStoreNames.contains(objectStoreName)) {
            localDb.createObjectStore(objectStoreName, { autoIncrement: true })
          }
        }

        request.onsuccess = (event: Event) => {
          resolve((event.target as IDBOpenDBRequest).result)
        }

        request.onerror = (event: Event) => {
          console.error('Error opening IndexedDB:', event)
          reject(new Error('Error opening IndexedDB'))
        }
      })
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error)
    }
  }

  function startSaving(canvas: Canvas) {
    c = canvas
    events.forEach(e => {
      EventBus.off(e, save)
      EventBus.on(e, save)
    })
  }

  function stopSaving() {
    events.forEach(e => {
      EventBus.off(e, save)
    })
  }

  function save() {
    // 1. Clear any pending debounce timeouts
    if (saveTimeout !== undefined) {
      clearTimeout(saveTimeout)
    }

    // 2. Clear any pending idle callbacks to prevent stale saves
    if (idleCallbackId !== undefined && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleCallbackId)
    }

    // 3. Debounce rapid events first
    saveTimeout = setTimeout(() => {

      const performSave = () => {
        if (c && db) {
          const json = c.toJSON() // Heavy operation deferred until idle
          const transaction = db.transaction([objectStoreName], 'readwrite')

          transaction.onerror = event => {
            console.error('Error writing to IndexedDB:', event)
          }

          const store = transaction.objectStore(objectStoreName)
          store.put(json, fixedKey)

          // Cleanup references
          saveTimeout = undefined
          idleCallbackId = undefined
        }
      }

      // 4. Wait for the main thread to be idle before saving
      if ('requestIdleCallback' in window) {
        idleCallbackId = window.requestIdleCallback(performSave, { timeout: 2000 })
      } else {
        // Fallback for unsupported browsers
        performSave()
      }

    }, 200)
  }

  function clear() {
    if (db) {
      const transaction = db.transaction([objectStoreName], 'readwrite')

      transaction.onerror = event => {
        console.error('Error writing to IndexedDB:', event)
      }

      const store = transaction.objectStore(objectStoreName)
      store.clear()
      console.log('removing canvas from local db')
    }
  }

  function get(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = db.transaction([objectStoreName], 'readonly')
      const store = transaction.objectStore(objectStoreName)
      const request = store.get(fixedKey)

      request.onsuccess = event => {
        resolve((event.target as IDBRequest).result)
      }

      request.onerror = event => {
        console.error('Error reading from IndexedDB:', event)
        reject(new Error('Error reading from IndexedDB'))
      }
    })
  }

  function destroy() {
    c = undefined
    if (saveTimeout !== undefined) clearTimeout(saveTimeout)
    if (idleCallbackId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleCallbackId)

    events.forEach(e => {
      EventBus.off(e, save)
    })
  }

  return { init, destroy, clear, get, startSaving, stopSaving }
}