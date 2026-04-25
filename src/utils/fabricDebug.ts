import { Canvas, FabricObject } from 'fabric'

export async function interactiveObjectInspector(c: Canvas) {
  const objects = c.getObjects()

  // 1. Calculate Total Canvas Size
  const totalRaw = JSON.stringify(c.toObject()).length
  const totalSizeMB = (totalRaw / (1024 * 1024)).toFixed(2)

  // 2. Map and Sort
  const reportData = objects.map((obj, index) => {
    const json = JSON.stringify(obj)
    return {
      index,
      type: obj.type,
      sizeBytes: json.length,
      sizeKB: (json.length / 1024).toFixed(2),
      obj,
      originalStroke: obj.stroke,
      originalStrokeWidth: obj.strokeWidth
    }
  })

  const sortedReport = [...reportData]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 20)

  // 3. Print Summary Table
  console.log(`%c 📊 CANVAS SIZE REPORT: ${totalSizeMB} MB `)
  console.log(`OBJECT COUNT ${c.getObjects().length}`)
  console.table(sortedReport.map(item => ({
    Type: item.type,
    'Size (KB)': item.sizeKB,
    'ID/Index': item.index
  })))

  let currentIndex = 0

  function inspectObject(index: number) {

    const item = sortedReport[index]
    const target = item.obj


    c.setActiveObject(target)
    c.requestRenderAll()

    console.log('---')
    console.log(`%c 🔍 Inspecting [${index + 1} / ${sortedReport.length}] `, 'background: #222; color: #fff; font-size: 12px')
    console.log(`Type: ${target.type} | Size: ${item.sizeKB} KB`)
    console.log('Object Data (Click to expand):', target) // This lets you see the .path array
    console.log('Commands: [→] Next | [←] Prev | [Esc] Exit')
  }

  const handleKeys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      currentIndex = (currentIndex + 1) % sortedReport.length
      inspectObject(currentIndex)
    } else if (e.key === 'ArrowLeft') {
      currentIndex = (currentIndex - 1 + sortedReport.length) % sortedReport.length
      inspectObject(currentIndex)
    } else if (e.key === 'Escape') {
      window.removeEventListener('keydown', handleKeys)
      sortedReport.forEach(item => {
        item.obj.set({ stroke: item.originalStroke, strokeWidth: item.originalStrokeWidth })
      })
      c.discardActiveObject()
      c.requestRenderAll()
      console.log('%c ✅ Inspection Finished ', 'color: #bada55; font-weight: bold')
    }
  }

  window.addEventListener('keydown', handleKeys)
  inspectObject(0)
}

export function setupCanvasVitalsMonitor(canvas: Canvas) {
  let renderCount = 0
  let renderStartTime = 0
  let lastLogTime = performance.now()
  let isEnabled = false

  const onBeforeRender = () => {
    renderStartTime = performance.now()
  }

  const onAfterRender = () => {
    const renderDuration = performance.now() - renderStartTime
    renderCount++

    const now = performance.now()

    // Log vitals every 1000ms
    if (now - lastLogTime >= 1000) {
      logVitals(renderDuration)
      renderCount = 0
      lastLogTime = now
    }
  }

  /**
   * Tracks the "weight" of a newly added object in the system.
   */
  const onObjectAdded = (options: { target: FabricObject }) => {
    const obj = options.target
    // Serialize to measure the data weight (approx bytes)
    const jsonString = JSON.stringify(obj.toObject())
    const sizeInBytes = new Blob([jsonString]).size
    const sizeInKb = (sizeInBytes / 1024).toFixed(2)

    console.log(
      `📦 %cObject Added: ${obj.type} | Size: ${sizeInKb} KB`,
      'color: #2196F3; font-weight: bold;'
    )

    if (sizeInBytes > 51200) { // Warning if a single stroke is > 50KB
      console.warn('⚠️ High-density object detected. Check Douglas-Peucker optimization!')
    }
  }

  const logVitals = (lastRenderDuration: number) => {
    const objectCount = canvas.getObjects().length

    let color = 'color: #4CAF50' // Healthy Green (< 16ms)
    if (lastRenderDuration > 16) color = 'color: #FF9800' // Warning Orange (> 60fps drop)
    if (lastRenderDuration > 50) color = 'color: #F44336' // Critical Red (ANR Risk)

    console.log(
      `%c[Vitals] 📈 Renders/sec: ${renderCount} | ⏱️ Last Render: ${lastRenderDuration.toFixed(2)}ms | 📦 Total Objects: ${objectCount}`,
      `${color}; font-weight: bold;`
    )
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      vitals.disable()
      console.log('🛑 Performance monitoring terminated.')
    }
    if (e.key === 'r') {
      canvas.renderAll()
    }
  }

  const vitals = {
    enable: () => {
      if (isEnabled) return
      isEnabled = true

      canvas.on('before:render', onBeforeRender)
      canvas.on('after:render', onAfterRender)
      canvas.on('object:added', onObjectAdded)
      window.addEventListener('keydown', onKeyDown)

      console.log('🩺 %cCanvas Vitals Monitor: Connected', 'color: #4CAF50; font-weight: bold;')
      console.log('⌨️  Press [ESC] to stop monitoring.')
    },
    disable: () => {
      if (!isEnabled) return
      isEnabled = false

      canvas.off('before:render', onBeforeRender)
      canvas.off('after:render', onAfterRender)
      canvas.off('object:added', onObjectAdded)
      window.removeEventListener('keydown', onKeyDown)

      console.log('🩺 Canvas Vitals Monitor: Disconnected')
    }
  }

  // Auto-enable upon initialization
  vitals.enable()

  return vitals
}