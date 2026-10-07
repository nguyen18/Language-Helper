import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { cutOutMask, cutOutSticker, loadImage, shrinkImage, type Point } from '../lib/images'
import { liftAt, loadLifter, type LiftMask } from '../lib/lift'

// Makes a sticker, three ways (owner's request 2026-10-01: trace, or the iPhone's own cut-out):
// - lift it out of a photo: pick a photo and tap the thing you want; MediaPipe's interactive segmenter
//   outlines it (lib/lift.ts, on the device, any browser), and it's cut out with a white border. (Showing
//   the photo for iOS's touch-and-hold Copy Subject didn't work in Safari, owner's report 2026-10-01.)
// - paste one already copied (a subject copied in the Photos app, see-through background and all; Clipboard
//   API, which asks with a Paste bubble and needs https), or paste onto the page itself (JournalEditor);
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
  const liftRef = useRef<HTMLInputElement>(null)
  // Tap-to-lift: the photo (a working copy), the lifted part's mask, and what's happening.
  const [liftImg, setLiftImg] = useState<HTMLImageElement | null>(null)
  const [liftMask, setLiftMask] = useState<LiftMask | null>(null)
  const [liftStatus, setLiftStatus] = useState<'loading' | 'ready' | 'lifting'>('loading')
  const liftCanvasRef = useRef<HTMLCanvasElement>(null)

  // The photo, dimmed outside the lifted part once there is one.
  useEffect(() => {
    const canvas = liftCanvasRef.current
    if (!canvas || !liftImg) return
    canvas.width = liftImg.naturalWidth
    canvas.height = liftImg.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(liftImg, 0, 0)
    if (!liftMask) return
    const shade = document.createElement('canvas')
    shade.width = liftMask.width
    shade.height = liftMask.height
    const pixels = new ImageData(liftMask.width, liftMask.height)
    for (let i = 0; i < liftMask.data.length; i++) {
      pixels.data[i * 4] = 35
      pixels.data[i * 4 + 1] = 37
      pixels.data[i * 4 + 2] = 110
      pixels.data[i * 4 + 3] = liftMask.data[i] ? 0 : 150
    }
    shade.getContext('2d')!.putImageData(pixels, 0, 0)
    ctx.drawImage(shade, 0, 0, canvas.width, canvas.height)
  }, [liftImg, liftMask])

  const pickToLift = async (f: File) => {
    setError(null)
    setLiftMask(null)
    try {
      const working = await shrinkImage(f, WORKING_SIZE, 'image/png')
      setLiftImg(await loadImage(working.blob))
      setLiftStatus('loading')
      await loadLifter()
      setLiftStatus('ready')
    } catch {
      setLiftStatus('ready')
      setError("Couldn't load the lifting tool. Check your connection, or trace it yourself instead.")
    }
  }

  const tapToLift = async (e: PointerEvent<HTMLCanvasElement>) => {
    if (!liftImg || liftStatus === 'lifting') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setError(null)
    setLiftStatus('lifting')
    try {
      const mask = await liftAt(liftImg, x, y)
      if (!mask.data.some(Boolean)) throw new Error("Couldn't find anything there. Try tapping the middle of it.")
      setLiftMask(mask)
    } catch (err) {
      setError((err as Error).message)
    }
    setLiftStatus('ready')
  }

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
          ref={liftRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pickToLift(f)
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
        {liftImg ? (
          <>
            <p className="muted">
              {liftStatus === 'loading'
                ? 'Getting the lifting tool ready… (the first time takes a moment)'
                : liftStatus === 'lifting'
                  ? 'Lifting it out…'
                  : liftMask
                    ? 'Happy with it? Make the sticker, or tap something else.'
                    : 'Tap the thing you want to lift out.'}
            </p>
            <canvas
              ref={liftCanvasRef}
              className={liftStatus === 'ready' ? 'sticker-canvas' : 'sticker-canvas busy'}
              onPointerUp={tapToLift}
            />
          </>
        ) : img ? (
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
            <button type="button" className="sticker-way" onClick={() => liftRef.current?.click()} disabled={busy}>
              <span className="sticker-way-icon" aria-hidden="true">
                🪄
              </span>
              <strong>Lift it out of a photo</strong>
              <span className="muted">Pick a photo, then tap the thing you want: it's cut out for you.</span>
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
          {!img && !liftImg && (
            <button type="button" onClick={pasteCutOut} disabled={busy}>
              Paste one I already copied
            </button>
          )}
          {liftImg && (
            <button type="button" onClick={() => liftRef.current?.click()}>
              Another photo
            </button>
          )}
          {liftImg && (
            <button
              type="button"
              className="primary"
              disabled={!liftMask || busy}
              onClick={async () => {
                if (!liftImg || !liftMask) return
                setBusy(true)
                try {
                  onDone(await cutOutMask(liftImg, liftMask))
                } catch (err) {
                  setError((err as Error).message)
                  setBusy(false)
                }
              }}
            >
              Make sticker
            </button>
          )}
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
