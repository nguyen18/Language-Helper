// Image helpers for the journal: shrinking photos before they're saved, and cutting stickers out of photos.

export type Point = { x: number; y: number }

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That file isn't a picture this browser can open."))
    }
    img.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Saving the picture failed.'))), type, quality),
  )
}

/**
 * The picture at most `max` pixels on its longer side. Photos become JPEG (small); stickers stay PNG,
 * which keeps their see-through background.
 */
export async function shrinkImage(
  file: Blob,
  max: number,
  type: 'image/jpeg' | 'image/png',
): Promise<{ blob: Blob; aspect: number }> {
  const img = await loadImage(file)
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { blob: await toBlob(canvas, type, 0.85), aspect: canvas.height / canvas.width }
}

/**
 * Cuts the part of `img` inside `outline` (in the image's own pixels) into a sticker: a PNG with a
 * see-through background and a white border, like stickers cut from photos on an iPhone.
 */
export async function cutOutSticker(
  img: HTMLImageElement,
  outline: Point[],
  maxSize = 800,
): Promise<{ blob: Blob; aspect: number }> {
  const xs = outline.map((p) => p.x)
  const ys = outline.map((p) => p.y)
  const left = Math.max(0, Math.min(...xs))
  const top = Math.max(0, Math.min(...ys))
  const right = Math.min(img.naturalWidth, Math.max(...xs))
  const bottom = Math.min(img.naturalHeight, Math.max(...ys))
  const scale = Math.min(1, maxSize / Math.max(right - left, bottom - top))
  // The border scales with the sticker, so small and large cut-outs look alike.
  const border = Math.max(4, Math.round(Math.max(right - left, bottom - top) * scale * 0.025))

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((right - left) * scale) + border * 2
  canvas.height = Math.ceil((bottom - top) * scale) + border * 2
  const ctx = canvas.getContext('2d')!
  const path = new Path2D()
  outline.forEach((p, i) => {
    const x = (p.x - left) * scale + border
    const y = (p.y - top) * scale + border
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  })
  path.closePath()

  // White border: the shape filled and drawn with a thick, rounded white line, under the picture.
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = border * 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.fill(path)
  ctx.stroke(path)
  ctx.save()
  ctx.clip(path)
  ctx.drawImage(img, -left * scale + border, -top * scale + border, img.naturalWidth * scale, img.naturalHeight * scale)
  ctx.restore()
  return { blob: await toBlob(canvas, 'image/png'), aspect: canvas.height / canvas.width }
}
