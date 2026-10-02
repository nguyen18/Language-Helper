import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { cutOutSticker, loadImage, shrinkImage, type Point } from '../lib/images'

// Makes a sticker, three ways (owner's request 2026-10-01: trace, or the iPhone's own cut-out):
// - paste an iPhone cut-out: in Photos, touch and hold the subject until it lifts, Copy, then tap here; the
//   clipboard's picture (see-through background and all) becomes the sticker (Clipboard API, which asks
//   with a Paste bubble; needs https). Pasting onto the page itself works too (JournalEditor);
// - trace it: pick a photo and draw around the part you want; it's cut out with a white border;
// - use a picture that's already cut out (a PNG with a see-through background) as it is.

// Traced points closer together than this (in screen pixels) are skipped.
const MIN_GAP = 3
// Phone photos are huge; tracing works on a copy this size (stickers come out at most 800 px anyway).
const WORKING_SIZE = 1200

// When the page can't read the clipboard (the browser said no, or has no Clipboard API).
const PASTE_ON_PAGE =
  "This browser didn't let the page read the clipboard. Close this, then touch and hold the journal page and tap Paste: the cut-out becomes a sticker."

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
  const wholeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

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

  // A picture used as it is: pasted from the clipboard or picked, kept as PNG for its see-through background.
  const keepWhole = async (picture: Blob) => {
    setBusy(true)
    try {
      onDone(await shrinkImage(picture, 800, 'image/png'))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const pasteCutOut = async () => {
    setError(null)
    const readClipboard = navigator.clipboard?.read?.bind(navigator.clipboard)
    if (!readClipboard) {
      setError(PASTE_ON_PAGE)
      return
    }
    try {
      for (const item of await readClipboard()) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) return void (await keepWhole(await item.getType(type)))
      }
      setError("There's no picture on the clipboard yet. In Photos, touch and hold the part you want, tap Copy, then try again.")
    } catch {
      setError(PASTE_ON_PAGE)
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
        <input
          ref={wholeRef}
          type="file"
          accept="image/png,image/webp,image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void keepWhole(f)
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
          <div className="sticker-ways">
            <button type="button" className="sticker-way" onClick={pasteCutOut} disabled={busy}>
              <span className="sticker-way-icon" aria-hidden="true">
                📋
              </span>
              <strong>Paste an iPhone cut-out</strong>
              <span className="muted">
                In Photos, touch and hold the part of a photo you want until it lifts, tap Copy, then tap here.
              </span>
            </button>
            <button type="button" className="sticker-way" onClick={() => fileRef.current?.click()} disabled={busy}>
              <span className="sticker-way-icon" aria-hidden="true">
                ✂️
              </span>
              <strong>Trace it yourself</strong>
              <span className="muted">Pick a photo and draw around the part you want.</span>
            </button>
            <button type="button" className="sticker-way" onClick={() => wholeRef.current?.click()} disabled={busy}>
              <span className="sticker-way-icon" aria-hidden="true">
                🖼️
              </span>
              <strong>Use a cut-out picture</strong>
              <span className="muted">A picture with a see-through background (like a saved sticker), as it is.</span>
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          {img && (
            <button type="button" onClick={() => fileRef.current?.click()}>
              Another photo
            </button>
          )}
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
