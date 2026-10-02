import { useEffect, useState } from 'react'
import type { SheetItem } from './journal'

// Text flowing around the photos and stickers on a journal page (owner's request 2026-10-01: every picture
// pushes the text aside). Pictures stay where they were placed (absolutely positioned); for each one, an
// invisible float takes its place in the text's flow, so lines wrap around it. A picture on the left half
// pushes the text right, one on the right half pushes it left (CSS can't wrap a line around both sides).
// Stickers wrap along their cut-out outline (shape-outside: polygon, from the image's see-through pixels);
// photos as rectangles. Rotation isn't followed: the upright shape is used.

// Space kept between a picture and the text, and room for a caption under it.
const GAP_X = 10
const GAP_Y = 6
const CAPTION = 38
// Rows the sticker outline is measured in.
const ROWS = 24

/** Per row, the sticker's leftmost and rightmost opaque points, as fractions of its width; null when empty. */
export type Outline = ({ l: number; r: number } | null)[]

const outlines = new WeakMap<Blob, Outline>()
const pending = new WeakMap<Blob, Promise<Outline>>()

async function measure(blob: Blob): Promise<Outline> {
  const bitmap = await createImageBitmap(blob)
  const width = 64
  const height = Math.max(ROWS, Math.round((bitmap.height / bitmap.width) * width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  return Array.from({ length: ROWS }, (_, row) => {
    let l = -1
    let r = -1
    const y0 = Math.floor((row / ROWS) * height)
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) / ROWS) * height))
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 32) {
          if (l < 0 || x < l) l = x
          if (x > r) r = x
        }
      }
    }
    return l < 0 ? null : { l: l / width, r: (r + 1) / width }
  })
}

/** The outlines of the given stickers, measured once per image (re-renders as each one is ready). */
export function useOutlines(items: SheetItem[]): (item: SheetItem) => Outline | undefined {
  const [, setReady] = useState(0)
  useEffect(() => {
    let cancelled = false
    for (const item of items) {
      if (item.kind !== 'sticker' || outlines.has(item.image)) continue
      let job = pending.get(item.image)
      if (!job) {
        job = measure(item.image).catch(() => [] as Outline)
        pending.set(item.image, job)
      }
      void job.then((o) => {
        outlines.set(item.image, o)
        if (!cancelled) setReady((n) => n + 1)
      })
    }
    return () => {
      cancelled = true
    }
  }, [items])
  return (item) => outlines.get(item.image)
}

/** One float in the text's flow: a spacer (zero width) or a picture's stand-in. */
export type WrapFloat = { key: string; side: 'left' | 'right'; width: number; height: number; shape?: string }

/**
 * The floats that make the text wrap around the pictures, in order, for a page `width` px wide. Floats must
 * come in order down the page (CSS won't put a float above an earlier one), so pictures are taken top to
 * bottom, each after a zero-width spacer on its side that pushes it down to where the picture is.
 */
export function wrapFloats(
  items: SheetItem[],
  width: number,
  outlineOf: (item: SheetItem) => Outline | undefined,
  withCaption: (item: SheetItem) => boolean,
): WrapFloat[] {
  if (!width) return []
  const floats: WrapFloat[] = []
  const bottom = { left: 0, right: 0 }
  let lastTop = 0
  const sorted = [...items].sort((a, b) => a.y - b.y)
  for (const item of sorted) {
    const x = item.x * width
    const w = item.w * width
    const h = item.w * item.aspect * width
    const side = x + w / 2 < width / 2 ? 'left' : 'right'
    const top = Math.max(0, item.y * width - GAP_Y)
    const height = h + GAP_Y * 2 + (withCaption(item) ? CAPTION : 0)
    // The spacer starts where its side's last picture ended (or the previous float's top, if lower).
    const start = Math.max(bottom[side], lastTop)
    const push = Math.max(0, top - start)
    floats.push({ key: `${item.id}-push`, side, width: 0, height: push })
    const floatTop = start + push
    const floatWidth = Math.max(0, Math.min(width, side === 'left' ? x + w + GAP_X : width - x + GAP_X))
    floats.push({
      key: item.id,
      side,
      width: floatWidth,
      height,
      shape: item.kind === 'sticker' ? stickerShape(outlineOf(item), side, x, w, h, floatWidth, height) : undefined,
    })
    bottom[side] = floatTop + height
    lastTop = floatTop
  }
  return floats
}

// The sticker's outline as a polygon in the float's own box (px), so the text hugs the cut-out edge: for a
// left float, the right edge of each row of the sticker; for a right float, the left edge.
function stickerShape(
  outline: Outline | undefined,
  side: 'left' | 'right',
  x: number,
  w: number,
  h: number,
  floatWidth: number,
  height: number,
): string | undefined {
  if (!outline?.some(Boolean)) return undefined
  const floatLeft = side === 'left' ? 0 : floatWidth > 0 ? x - GAP_X : 0
  // Where the text may start (left float) or must end (right float), per row, in the float's box.
  const edge = (row: { l: number; r: number } | null) => {
    if (!row) return side === 'left' ? 0 : floatWidth
    return side === 'left' ? x + row.r * w + GAP_X : x + row.l * w - GAP_X - floatLeft
  }
  const points: [number, number][] = []
  const rowHeight = h / outline.length
  outline.forEach((row, i) => {
    const e = Math.max(0, Math.min(floatWidth, edge(row)))
    points.push([e, GAP_Y + i * rowHeight], [e, GAP_Y + (i + 1) * rowHeight])
  })
  // Above and below the sticker (and its caption): the whole box.
  const full = side === 'left' ? floatWidth : 0
  points.unshift([full, 0])
  points.push([full, height])
  // Closed along the float's outer edge (the page's side).
  const outer = side === 'left' ? 0 : floatWidth
  const all: [number, number][] = [[outer, 0], ...points, [outer, height]]
  return `polygon(${all.map(([px, py]) => `${px.toFixed(1)}px ${py.toFixed(1)}px`).join(', ')})`
}

/** The element's width, kept up to date as it resizes. */
export function useWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return width
}
