export const isCompletelyErased = (
  obj: any,
  alphaThreshold: number = 15,    // 0-255: Ignores faint anti-aliasing
  pixelCountThreshold: number = 5 // Max number of visible pixels allowed
): boolean => {
  // Export to an offscreen canvas
  const canvasEl = obj.toCanvasElement({ multiplier: 0.1 });
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });

  const width = canvasEl.width;
  const height = canvasEl.height;

  if (width === 0 || height === 0) return true;

  const { data } = ctx!.getImageData(0, 0, width, height);

  let visiblePixelCount = 0;

  for (let i = 3; i < data.length; i += 4) {
    // Check if the pixel's alpha exceeds our threshold
    if (data[i] >= alphaThreshold) {
      visiblePixelCount++;

      if (visiblePixelCount > pixelCountThreshold) {
        return false;
      }
    }
  }

  return true;
};