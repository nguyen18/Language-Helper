import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { cutOutSticker, loadImage, shrinkImage, type Point } from '../lib/images'

// Makes a sticker from a photo: trace around the part you want with a finger or the mouse and it's cut
// out with a white border, like iPhone stickers. A picture that's already cut out (a PNG with a
// see-through background, e.g. an iPhone sticker saved to Photos) can be used whole.

// Traced points closer together than this (in screen pixels) are skipped.
const MIN_GAP = 3
// Phone photos are huge; tracing works on a copy this size (stickers come out at most 800 px anyway).
const WORKING_SIZE = 1200

type Props = {
  onDone: (sticker: { blob: Blob; aspect: number }) => void
  onCancel: () => void
}

export function StickerMaker({ onDone, onCancel }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [outline, setOutline] = useState<Point[]>([])
  const [drawing, setDrawing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Ask for a picture as soon as it opens.
  useEffect(() => fileRef.current?.click(), [])

  // The canvas is sized once per picture (resizing it on every stroke is slow).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
  }, [img])

  // The picture with the traced line on top, darkened outside it once the line is closed.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    if (outline.length < 2) return
    const path = new Path2D()
    outline.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)))
    if (!drawing) {
      path.closePath()
      ctx.save()
      ctx.fillStyle = 'rgba(35, 37, 110, 0.55)'
      const outside = new Path2D()
      outside.rect(0, 0, canvas.width, canvas.height)
      outside.addPath(path)
      ctx.fill(outside, 'evenodd')
      ctx.restore()
    }
    const line = Math.max(3, img.naturalWidth / 150)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = line * 2
    ctx.stroke(path)
    ctx.strokeStyle = '#2e3192'
    ctx.lineWidth = line
    ctx.stroke(path)
  }, [img, outline, drawing])

  const pick = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    try {
      const working = await shrinkImage(f, WORKING_SIZE, 'image/png')
      setImg(await loadImage(working.blob))
      setFile(f)
      setOutline([])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Screen position → the picture's own pixels.
  const toImage = (e: PointerEvent): Point => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const onDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrawing(true)
    setOutline([toImage(e)])
  }

  const onMove = (e: PointerEvent) => {
    if (!drawing) return
    const p = toImage(e)
    const canvas = canvasRef.current!
    const gap = (MIN_GAP * canvas.width) / canvas.getBoundingClientRect().width
    setOutline((o) => {
      const last = o[o.length - 1]
      return last && Math.hypot(p.x - last.x, p.y - last.y) < gap ? o : [...o, p]
    })
  }

  const traced = !drawing && outline.length > 2

  const make = async (whole: boolean) => {
    if (!img || !file) return
    setBusy(true)
    try {
      onDone(whole ? await shrinkImage(file, 800, 'image/png') : await cutOutSticker(img, outline))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sticker-maker-title">
        <h2 id="sticker-maker-title">Make a sticker</h2>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {img ? (
          <>
            <p className="muted">
              {traced
                ? 'Happy with it? Make the sticker, or trace again.'
                : 'Trace around the part you want with your finger or mouse.'}
            </p>
            <canvas
              ref={canvasRef}
              className="sticker-canvas"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => setDrawing(false)}
              onPointerCancel={() => setDrawing(false)}
            />
          </>
        ) : (
          <p className="muted">Pick a photo to cut a sticker out of.</p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            {img ? 'Another photo' : 'Pick a photo'}
          </button>
          {img && (
            <button type="button" onClick={() => make(true)} disabled={busy}>
              Use the whole picture
            </button>
          )}
          {img && (
            <button type="button" className="primary" onClick={() => make(false)} disabled={!traced || busy}>
              Make sticker
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
