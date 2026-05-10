import { Canvas, FabricObject } from 'fabric'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useDrawLoadStore } from '@/draw/store/drawLoad.store'

/**
 * 🎨 EZPZ Canvas Debugger (Advanced Edition)
 * Controls:
 * [Ctrl+Shift+D] - Open Manual / Inspect Objects
 * [→] / [←]      - Navigate Top 30 Heaviest Objects
 * [Delete]       - Delete object from canvas
 * [T]            - Run Chunked Loading Benchmark
 * [R]            - Manual Re-render
 * [Esc]          - Close Manual
 */
export function setupCanvasDebugger(canvas: Canvas) {
  const syncer = useDrawSyncer()
  const loadStore = useDrawLoadStore()

  let pipelineStart = 0, framesTaken = 0, isInspecting = false
  let sortedReport: any[] = [], currentIndex = 0

  // --- 📈 1. PERFORMANCE MONITORING ---

  const onPipelineStart = () => { pipelineStart = performance.now(); framesTaken = 0 }
  const onPipelineChunk = () => { framesTaken++ }
  const onPipelineEnd = () => {
    const duration = performance.now() - pipelineStart
    const objects = canvas.getObjects()
    const color = duration > 500 ? '#F44336' : (duration > 100 ? '#FF9800' : '#4CAF50')

    console.log(
      `%c ⚡ PIPELINE %c ${duration.toFixed(2)}ms | ${framesTaken} chunks | Objs: ${objects.length} `,
      `background: ${color}; color: white; padding: 2px; font-weight: bold; border-radius: 3px 0 0 3px;`,
      `background: #333; color: white; padding: 2px; border-radius: 0 3px 3px 0;`
    )
  }

  // Hook for the sync queue telemetry we discussed
  const onSyncActionDone = (e: any) => {
    const { type, duration } = e
    const color = duration > 16 ? '#F44336' : '#2196F3'
    console.log(
      `%c 🛰️ SYNC %c ${type} %c ${duration.toFixed(2)}ms `,
      `background: #333; color: #00ebff; padding: 2px;`,
      `background: #444; color: white; padding: 2px;`,
      `background: ${color}; color: white; padding: 2px; font-weight: bold;`
    )
  }

  // --- 🧪 2. BENCHMARKING ---

  const runLoadingBenchmark = async () => {
    console.log('%c 🧪 BENCHMARK: Testing Chunked Loading Performance... ', 'background: #FF9800; color: white; padding: 4px;')
    const currentData = canvas.toObject(['id', 'userId'])
    const startTime = performance.now()

    // This triggers your actual production async/time-slivered loader
    await loadStore.loadCanvas(canvas, { json: currentData, isLobby: true })

    const endTime = performance.now()
    console.log(`%c 🏁 DONE: Canvas reloaded in ${(endTime - startTime).toFixed(2)}ms `, 'background: #4CAF50; color: white; padding: 4px;')
  }

  // --- 🛠️ 3. INTERACTIVE MANUAL ---

  const renderCurrentInspection = () => {
    const item = sortedReport[currentIndex]
    if (!item) return

    canvas.setActiveObject(item.obj)
    canvas.requestRenderAll()

    // Measure Total JSON footprint
    const totalRaw = JSON.stringify(canvas.toObject(['id', 'userId'])).length
    const totalSizeMB = (totalRaw / (1024 * 1024)).toFixed(2)

    console.clear()
    console.log(`%c 🕹️ DEBUG MANUAL [${currentIndex + 1}/${sortedReport.length}] `, 'background: #673ab7; color: white; padding: 5px; font-size: 16px; font-weight: bold;')

    console.log(
      `%c 📊 TOTAL CANVAS SIZE: ${totalSizeMB} MB %c 📡 SYNC: ${syncer.roomId ? 'ROOM ACTIVE' : 'LOCAL'} `,
      'color: #E91E63; font-weight: bold;', 'color: #00BCD4; font-weight: bold;'
    )

    console.log(
      `%c CONTROLS: %c [→/←] Nav %c [Del] Remove %c [T] Benchmark %c [R] Render %c [Esc] Quit `,
      'font-weight: bold;',
      'color: #2196F3;', 'color: #F44336;', 'color: #FF9800;', 'color: #4CAF50;', 'color: #9E9E9E;'
    )

    console.log('---')
    console.log(`%cObject: %c${item.type} (ID: ${item.id})`, 'font-weight: bold;', 'color: #FFC107;')
    console.log(`%cWeight: %c${item.complexity} nodes | ${item.sizeKB} KB`, 'font-weight: bold;', 'color: #03A9F4;')
    console.log(`%cVisible: %c${item.obj.visible ? 'YES' : 'NO (Culled by Manager)'}`, 'font-weight: bold;', item.obj.visible ? 'color: #4CAF50;' : 'color: #F44336;')
    console.log('---')
    console.log('Full Instance Trace:', item.obj)
  }

  const startInspection = () => {
    isInspecting = true
    const objects = canvas.getObjects()
    sortedReport = objects.map(obj => {
      const complexity = (obj as any).path?.length || (obj as any)._objects?.length || 0
      const json = JSON.stringify(obj.toObject(['id', 'userId']))
      return { id: obj.id, type: obj.type, complexity, sizeKB: (json.length / 1024).toFixed(2), obj }
    })
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 30)

    currentIndex = 0
    renderCurrentInspection()
  }

  // --- ⌨️ 4. INPUT HANDLING ---

  const handleKeys = (e: KeyboardEvent) => {
    // Open Shortcut
    if (e.ctrlKey && e.shiftKey && e.key === 'D') return startInspection()

    if (!isInspecting) return

    switch (e.key) {
      case 'ArrowRight':
        currentIndex = (currentIndex + 1) % sortedReport.length
        break
      case 'ArrowLeft':
        currentIndex = (currentIndex - 1 + sortedReport.length) % sortedReport.length
        break
      case 'Delete':
        canvas.remove(sortedReport[currentIndex].obj)
        sortedReport.splice(currentIndex, 1)
        if (sortedReport.length === 0) { isInspecting = false; console.log('Canvas Cleared!'); return; }
        break
      case 't':
      case 'T':
        runLoadingBenchmark()
        return // Don't re-render manual yet
      case 'r':
      case 'R':
        canvas.requestRenderAll()
        break
      case 'Escape':
        isInspecting = false
        canvas.discardActiveObject()
        canvas.requestRenderAll()
        console.log('%c ✅ Debugger Closed ', 'color: #bada55; font-weight: bold')
        return
      default:
        return
    }
    renderCurrentInspection()
  }

  // --- 🚀 5. LIFECYCLE ---

  const enable = () => {
    // Pipeline events from drawObjectManager
    canvas.on('render:pipeline:start' as any, onPipelineStart)
    canvas.on('render:pipeline:chunk' as any, onPipelineChunk)
    canvas.on('render:pipeline:end' as any, onPipelineEnd)

    // Sync events from useDrawSyncer
    canvas.on('sync:action:done' as any, onSyncActionDone)

    window.addEventListener('keydown', handleKeys)

    console.log('%c 🩺 EZPZ DEBUGGER LOADED ', 'background: #4CAF50; color: white; padding: 4px; font-weight: bold; border-radius: 4px;')
    console.log('Use %cCtrl+Shift+D%c to open the control panel.', 'color: #2196F3; font-weight: bold;', '')
  }

  enable()

  return {
    disable: () => {
      canvas.off('render:pipeline:start' as any)
      canvas.off('render:pipeline:chunk' as any)
      canvas.off('render:pipeline:end' as any)
      canvas.off('sync:action:done' as any)
      window.removeEventListener('keydown', handleKeys)
    }
  }
}