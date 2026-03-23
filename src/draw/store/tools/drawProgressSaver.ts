import { EventBus } from '@/main'
import { Canvas } from 'fabric'

export function useDrawProgressSaver() {
  let c: Canvas | undefined
  const events = ['undo', 'redo', 'add_to_undo_stack', 'saveDrawing']

  const dbName = 'canvasDB'
  const objectStoreName = 'canvasHistory'
  let db: IDBDatabase | undefined
  const fixedKey = 1 // Using 1 as a fixed key to always overwrite the same record

  let saveTimeout: NodeJS.Timeout | undefined

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
      // Handle the error (or throw it, or propagate it, depending on your needs)
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

  function save() {
    if (saveTimeout !== undefined) {
      clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() => {
      if (c && db) {
        const json = c.toJSON()
        const transaction = db.transaction([objectStoreName], 'readwrite')

        transaction.onerror = event => {
          console.error('Error writing to IndexedDB:', event)
        }

        const store = transaction.objectStore(objectStoreName)
        store.put(json, fixedKey)
        saveTimeout = undefined
        // console.log('saving canvas to local db')
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
    events.forEach(e => {
      EventBus.off(e, save)
    })
  }

  return { init, destroy, clear, get, startSaving }
}