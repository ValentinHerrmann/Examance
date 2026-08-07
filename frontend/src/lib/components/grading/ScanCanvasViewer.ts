export interface AutoCropBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getAutoCropBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): AutoCropBounds {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    const step = 4;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (lum < 225) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      return { x: 0, y: 0, w: width, h: height };
    }

    const pad = 20;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(width - cropX, maxX - minX + pad * 2);
    const cropH = Math.min(height - cropY, maxY - minY + pad * 2);

    if (cropW < width * 0.95 || cropH < height * 0.95) {
      return { x: cropX, y: cropY, w: cropW, h: cropH };
    }
  } catch (e) {
    console.error("Auto crop calculation failed:", e);
  }
  return { x: 0, y: 0, w: width, h: height };
}
