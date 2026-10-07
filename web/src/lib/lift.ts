// Tap-to-lift for stickers (owner's request 2026-10-01: iPhone Safari didn't offer Copy Subject on photos in
// the page): tap the thing you want in a photo and MediaPipe's interactive segmenter outlines it, on the
// device, in any browser. Its library (code-split: loaded only when lifting) runs in WebAssembly from the
// jsDelivr CDN, and its model (magic_touch, ~6 MB) comes from Google the first time.
//
// Uses InteractiveSegmenterLegacy (a tap point); 1.0's newer InteractiveSegmenter takes strokes and needs a
// different, split model.

import type { InteractiveSegmenterLegacy } from '@mediapipe/tasks-vision'

const VERSION = '1.0.1'
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`
const MODEL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite'

let segmenter: Promise<InteractiveSegmenterLegacy> | null = null

/** The segmenter, loaded once (library, WebAssembly and model). Rejects when they can't be loaded. */
export function loadLifter(): Promise<InteractiveSegmenterLegacy> {
  segmenter ??= (async () => {
    const { FilesetResolver, InteractiveSegmenterLegacy } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM)
    return InteractiveSegmenterLegacy.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL },
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    })
  })().catch((err: unknown) => {
    segmenter = null
    throw err
  })
  return segmenter
}

/** Which pixels of the picture are the thing at the tap: 1 for it, 0 for the rest, row by row. */
export type LiftMask = { width: number; height: number; data: Uint8Array }

/**
 * The thing at (x, y) in `image` (fractions of its width and height), as a mask the size of the image.
 * MediaPipe's category mask is 0 on the object and 255 elsewhere; it's flipped to 1 = object here.
 */
export async function liftAt(image: HTMLCanvasElement | HTMLImageElement, x: number, y: number): Promise<LiftMask> {
  const seg = await loadLifter()
  return new Promise((resolve, reject) => {
    try {
      seg.segment(image, { keypoint: { x, y } }, (result) => {
        const mask = result.categoryMask
        if (!mask) return reject(new Error("Couldn't find anything there. Try tapping the middle of it."))
        const raw = mask.getAsUint8Array()
        const data = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) data[i] = raw[i] === OBJECT ? 1 : 0
        resolve({ width: mask.width, height: mask.height, data })
      })
    } catch (err) {
      reject(err)
    }
  })
}

// The category mask's value on the tapped object (checked on a test image: see ARCHITECTURE.md).
const OBJECT = 0
