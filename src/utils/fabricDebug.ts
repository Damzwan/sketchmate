import { Canvas } from 'fabric'

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
  console.log(`%c 📊 CANVAS SIZE REPORT: ${totalSizeMB} MB `, 'background: #bada55; color: #222; font-weight: bold; font-size: 16px')
  console.table(sortedReport.map(item => ({
    Type: item.type,
    'Size (KB)': item.sizeKB,
    'ID/Index': item.index
  })))

  let currentIndex = 0

  function inspectObject(index: number) {
    // Reset previous highlights
    sortedReport.forEach(item => {
      item.obj.set({ stroke: item.originalStroke, strokeWidth: item.originalStrokeWidth })
    })

    const item = sortedReport[index]
    const target = item.obj

    // Highlight and Focus
    target.set({
      stroke: '#ff0000',
      strokeWidth: 4 / c.getZoom()
    })

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