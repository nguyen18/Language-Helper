import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { objectUrl, type SheetItem } from '../lib/journal'

// The entry sheet: the journal text on lined paper, with photos and stickers placed anywhere on it.
// Positions and sizes are fractions of the sheet's width (see SheetItem), so the page looks the same
// on a phone and a laptop; CSS turns them into lengths with container query units (cqw).

const MIN_W = 0.08
const MAX_W = 1
// Keeps items from being dragged off the page entirely.
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type Props = {
  text: string
  items: SheetItem[]
  /** Given when editing: the text is a textarea and items can be moved, resized, rotated and removed. */
  onTextChange?: (text: string) => void
  onItemsChange?: (items: SheetItem[]) => void
  placeholder?: string
  lang?: string
  label?: string
}

export function JournalSheet({ text, items, onTextChange, onItemsChange, placeholder, lang, label }: Props) {
  const editable = Boolean(onTextChange && onItemsChange)
  const sheetRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  // The latest items, for drags: a drag's pointer handlers outlive the render that started it.
  const itemsRef = useRef(items)
  useLayoutEffect(() => {
    itemsRef.current = items
  })

  // The textarea grows with its text, so the sheet reads like a page rather than a scrolling box.
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  // The page is at least as tall as its lowest photo or sticker.
  const bottom = Math.max(0, ...items.map((i) => i.y + i.w * i.aspect))

  const setItems = (next: SheetItem[]) => {
    itemsRef.current = next
    onItemsChange?.(next)
  }

  const update = (id: string, change: Partial<SheetItem>) =>
    setItems(itemsRef.current.map((i) => (i.id === id ? { ...i, ...change } : i)))

  const select = (id: string) => {
    setSelected(id)
    // The picked item comes to the front.
    const list = itemsRef.current
    const item = list.find((i) => i.id === id)
    if (item && list[list.length - 1].id !== id) setItems([...list.filter((i) => i.id !== id), item])
  }

  const remove = (id: string) => {
    setItems(itemsRef.current.filter((i) => i.id !== id))
    setSelected(null)
  }

  // Dragging: `mode` says what the pointer is doing; changes are computed from where the drag started.
  const startDrag = (e: PointerEvent, item: SheetItem, mode: 'move' | 'resize' | 'rotate') => {
    if (!editable || !sheetRef.current) return
    e.preventDefault()
    e.stopPropagation()
    select(item.id)
    const rect = sheetRef.current.getBoundingClientRect()
    const width = rect.width
    const start = { x: e.clientX, y: e.clientY }
    const centre = {
      x: rect.left + (item.x + item.w / 2) * width,
      y: rect.top + (item.y + (item.w * item.aspect) / 2) * width,
    }
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = (ev.clientX - start.x) / width
      const dy = (ev.clientY - start.y) / width
      if (mode === 'move') {
        update(item.id, {
          x: clamp(item.x + dx, -item.w / 2, 1 - item.w / 2),
          y: Math.max(-(item.w * item.aspect) / 2, item.y + dy),
        })
      } else if (mode === 'resize') {
        // Grows from the centre, by how far the handle moved away from it.
        const before = Math.hypot(start.x - centre.x, start.y - centre.y)
        const after = Math.hypot(ev.clientX - centre.x, ev.clientY - centre.y)
        const w = clamp(item.w * (after / Math.max(1, before)), MIN_W, MAX_W)
        update(item.id, { w, x: item.x + (item.w - w) / 2, y: item.y + ((item.w - w) * item.aspect) / 2 })
      } else {
        const angle = (a: { x: number; y: number }) => (Math.atan2(a.y - centre.y, a.x - centre.x) * 180) / Math.PI
        const rotation = item.rotation + angle({ x: ev.clientX, y: ev.clientY }) - angle(start)
        update(item.id, { rotation: Math.round(rotation) })
      }
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  // Keyboard: arrows move, + and - resize, [ and ] rotate, Delete removes.
  const onItemKey = (e: KeyboardEvent, item: SheetItem) => {
    const step = e.shiftKey ? 0.05 : 0.01
    const moves: Record<string, Partial<SheetItem>> = {
      ArrowLeft: { x: item.x - step },
      ArrowRight: { x: item.x + step },
      ArrowUp: { y: item.y - step },
      ArrowDown: { y: item.y + step },
      '+': { w: clamp(item.w * 1.1, MIN_W, MAX_W) },
      '=': { w: clamp(item.w * 1.1, MIN_W, MAX_W) },
      '-': { w: clamp(item.w / 1.1, MIN_W, MAX_W) },
      '[': { rotation: item.rotation - 5 },
      ']': { rotation: item.rotation + 5 },
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      remove(item.id)
    } else if (moves[e.key]) {
      e.preventDefault()
      update(item.id, moves[e.key])
    }
  }

  return (
    <div className="journal-sheet-frame">
      <div
        ref={sheetRef}
        className={`journal-sheet${editable ? ' editing' : ''}`}
        style={{ minHeight: `calc(${bottom * 100}cqw + 24px)` }}
        onPointerDown={() => setSelected(null)}
      >
        {editable ? (
          <textarea
            ref={textRef}
            className="journal-text"
            value={text}
            lang={lang}
            aria-label={label}
            placeholder={placeholder}
            onChange={(e) => onTextChange!(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            rows={8}
          />
        ) : (
          <p className="journal-text" lang={lang}>
            {text}
          </p>
        )}
        {items.map((item) => (
          <ItemView
            key={item.id}
            item={item}
            editable={editable}
            selected={selected === item.id}
            onStart={(e, mode) => startDrag(e, item, mode)}
            onKey={(e) => onItemKey(e, item)}
            onFocus={() => setSelected(item.id)}
            onRemove={() => remove(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

type ItemProps = {
  item: SheetItem
  editable: boolean
  selected: boolean
  onStart: (e: PointerEvent, mode: 'move' | 'resize' | 'rotate') => void
  onKey: (e: KeyboardEvent) => void
  onFocus: () => void
  onRemove: () => void
}

function ItemView({ item, editable, selected, onStart, onKey, onFocus, onRemove }: ItemProps) {
  const url = objectUrl(item.image)
  const name = item.kind === 'photo' ? 'Photo' : 'Sticker'
  return (
    <div
      className={`sheet-item ${item.kind}${selected ? ' selected' : ''}`}
      style={{
        left: `${item.x * 100}cqw`,
        top: `${item.y * 100}cqw`,
        width: `${item.w * 100}cqw`,
        transform: `rotate(${item.rotation}deg)`,
      }}
      {...(editable && {
        tabIndex: 0,
        role: 'button',
        'aria-label': `${name}: drag to move. Arrow keys move, + and − resize, [ and ] rotate, Delete removes.`,
        onPointerDown: (e: PointerEvent) => onStart(e, 'move'),
        onKeyDown: onKey,
        onFocus,
      })}
    >
      <img src={url} alt={editable ? '' : name} draggable={false} />
      {editable && selected && (
        <>
          <button
            type="button"
            className="item-handle remove"
            aria-label={`Remove ${name.toLowerCase()}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
          >
            ✕
          </button>
          <span className="item-handle rotate" aria-hidden="true" onPointerDown={(e) => onStart(e, 'rotate')}>
            ⟳
          </span>
          <span className="item-handle resize" aria-hidden="true" onPointerDown={(e) => onStart(e, 'resize')} />
        </>
      )}
    </div>
  )
}
