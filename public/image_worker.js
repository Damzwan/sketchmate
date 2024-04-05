self.onmessage = function(event) {
  const chunk = event.data
  const results = []
  for (const frameData of chunk) {
    results.push(frameProcessingWorker(frameData))
  }
  Promise.all(results).then((processedData) => {
    // Send processed data back to the main thread
    self.postMessage(processedData)
  })
}

const frameProcessingWorker = async (frameData) => {
  const maxSize = 1280
  const [im1, im2, duration] = frameData
  const [bitmap1, bitmap2] = await Promise.all([
    createImageBitmap(im1),
    createImageBitmap(im2)
  ])
  const scaleFactor = Math.min(maxSize / im1.width, maxSize / im1.height)
  const newWidth = Math.floor(im1.width * scaleFactor)
  const newHeight = Math.floor(im1.height * scaleFactor)
  const ca = new OffscreenCanvas(newWidth, newHeight)
  const ctx = ca.getContext('2d')
  ctx.globalCompositeOperation = 'multiply'
  ctx.drawImage(bitmap1, 0, 0, im1.width, im1.height, 0, 0, newWidth, newHeight)
  ctx.drawImage(bitmap2, 0, 0, im1.width, im1.height, 0, 0, newWidth, newHeight)
  const blob = await ca.convertToBlob({ quality: 0.5, type: 'image/webp' })
  return [await toDataUrl(blob), duration]
}

async function toDataUrl(blob) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}
