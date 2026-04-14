/** Square viewport side in CSS px — must match crop UI in ProfilePage. */
export const AVATAR_CROP_VIEWPORT_PX = 300

/** Output avatar size (plan: 1024). */
export const AVATAR_OUTPUT_SIZE = 1024

/** Target compressed size band (bytes). */
const TARGET_MIN = 600 * 1024
const TARGET_MAX = 1.2 * 1024 * 1024

export function loadImageFromUrl (objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = objectUrl
  })
}

/**
 * Scale so the image covers a square viewport (like object-fit: cover at zoom 1).
 */
export function coverScaleForViewport (iw: number, ih: number, viewportPx: number): number {
  return Math.max(viewportPx / iw, viewportPx / ih)
}

export type CropParams = {
  /** Natural image width/height */
  iw: number
  ih: number
  /** Viewport square side (px) */
  viewportPx: number
  /** Multiplier on top of cover scale (>= 1) */
  zoom: number
  /** Pan in px (moves the scaled image) */
  panX: number
  panY: number
}

/**
 * Square region in source image pixel coordinates [sx, sy, sw, sh] that the viewport shows.
 */
export function getSquareCropRectInImageSpace (p: CropParams): { sx: number; sy: number; s: number } {
  const { iw, ih, viewportPx, zoom, panX, panY } = p
  const cover = coverScaleForViewport(iw, ih, viewportPx)
  const actualScale = cover * zoom
  const W = iw * actualScale
  const H = ih * actualScale
  const offsetX = (viewportPx - W) / 2 + panX
  const offsetY = (viewportPx - H) / 2 + panY
  const s = viewportPx / actualScale
  const sx = (0 - offsetX) / actualScale
  const sy = (0 - offsetY) / actualScale
  return { sx, sy, s }
}

/** Clamp pan so the viewport stays within the scaled image. */
export function clampPan (
  iw: number,
  ih: number,
  viewportPx: number,
  zoom: number,
  panX: number,
  panY: number,
): { panX: number; panY: number } {
  const cover = coverScaleForViewport(iw, ih, viewportPx)
  const actualScale = cover * zoom
  const W = iw * actualScale
  const H = ih * actualScale
  const minPanX = (viewportPx - W) / 2
  const maxPanX = (W - viewportPx) / 2
  const minPanY = (viewportPx - H) / 2
  const maxPanY = (H - viewportPx) / 2
  return {
    panX: Math.min(maxPanX, Math.max(minPanX, panX)),
    panY: Math.min(maxPanY, Math.max(minPanY, panY)),
  }
}

async function canvasToBlob (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality)
  })
}

/**
 * Draw square crop from image into 1024x1024 canvas, then compress to webp or jpeg.
 */
export async function renderCroppedAvatarBlob (img: HTMLImageElement, crop: CropParams): Promise<{ blob: Blob; mime: string }> {
  const { sx, sy, s } = getSquareCropRectInImageSpace(crop)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const sxClamped = Math.max(0, Math.min(iw - s, sx))
  const syClamped = Math.max(0, Math.min(ih - s, sy))
  const sClamped = Math.min(s, iw - sxClamped, ih - syClamped)

  ctx.drawImage(
    img,
    sxClamped,
    syClamped,
    sClamped,
    sClamped,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  )

  const tryWebp = async (): Promise<{ blob: Blob; mime: string } | null> => {
    let q = 0.92
    for (let i = 0; i < 12; i++) {
      const blob = await canvasToBlob(canvas, 'image/webp', q)
      if (!blob) break
      if (blob.size <= TARGET_MAX || q <= 0.5) {
        return { blob, mime: 'image/webp' }
      }
      q -= 0.06
    }
    return null
  }

  const tryJpeg = async (): Promise<{ blob: Blob; mime: string }> => {
    let q = 0.9
    for (let i = 0; i < 18; i++) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', q)
      if (blob) {
        if (blob.size <= TARGET_MAX || q <= 0.45) {
          return { blob, mime: 'image/jpeg' }
        }
      }
      q -= 0.04
    }
    const last = await canvasToBlob(canvas, 'image/jpeg', 0.82)
    if (!last) throw new Error('Could not encode image')
    return { blob: last, mime: 'image/jpeg' }
  }

  const webp = await tryWebp()
  if (webp && webp.blob.size > 0) {
    if (webp.blob.size < TARGET_MIN) {
      // Rare: too small — bump quality once
      const bigger = await canvasToBlob(canvas, 'image/webp', 0.98)
      if (bigger) return { blob: bigger, mime: 'image/webp' }
    }
    return webp
  }

  return tryJpeg()
}

export function extensionForMime (mime: string): 'webp' | 'jpg' {
  return mime.includes('webp') ? 'webp' : 'jpg'
}
