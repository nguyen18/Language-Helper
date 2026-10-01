import { useEffect, useRef, useState } from 'react'
import { newId, nowLocal, objectUrl, useStickers, type JournalEntry, type SheetItem, type Sticker } from '../lib/journal'
import { shrinkImage } from '../lib/images'
import type { TargetLanguage } from '../lib/languages'
import { AudioNoteRecorder } from './AudioNoteRecorder'
import { JournalSheet } from './JournalSheet'
import { StickerMaker } from './StickerMaker'

// Writing or editing a journal entry: when it happened, the entry sheet (text, photos and stickers placed
// anywhere), and an optional audio note.

type Props = {
  target: TargetLanguage
  /** The entry being edited; a new one when missing. */
  entry?: JournalEntry
  onSave: (entry: JournalEntry) => Promise<void>
  onCancel: () => void
}

// New photos and stickers go below the writing and everything already on the page, alternating left
// and right, so they never cover anything; they can be dragged anywhere after. `textBottom` is where the
// text ends, as a fraction of the sheet's width.
function placeNew(items: SheetItem[], w: number, textBottom: number): Pick<SheetItem, 'x' | 'y' | 'rotation'> {
  const right = items.length % 2 === 1
  const lowest = Math.max(textBottom, ...items.map((i) => i.y + i.w * i.aspect))
  return { x: right ? Math.max(0.04, 0.96 - w) : 0.04, y: lowest + 0.03, rotation: right ? 3 : -3 }
}

// How far down the sheet the text reaches (not counting the empty lines the box starts with).
function textBottom(frame: HTMLElement | null): number {
  const box = frame?.querySelector('textarea')
  if (!frame || !box) return 0
  const { height, minHeight } = box.style
  box.style.minHeight = '0'
  box.style.height = '0'
  const bottom = box.scrollHeight
  box.style.minHeight = minHeight
  box.style.height = height
  return bottom / frame.getBoundingClientRect().width
}

export function JournalEditor({ target, entry, onSave, onCancel }: Props) {
  const [when, setWhen] = useState(entry?.when ?? nowLocal)
  const [text, setText] = useState(entry?.text ?? '')
  const [items, setItems] = useState<SheetItem[]>(entry?.items ?? [])
  const [audio, setAudio] = useState(entry?.audio)
  const [makingSticker, setMakingSticker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { stickers, add: addSticker, remove: removeSticker } = useStickers()
  const photoRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const addItem = (kind: SheetItem['kind'], image: Blob, aspect: number) => {
    const w = kind === 'photo' ? 0.42 : 0.26
    const below = textBottom(sheetRef.current)
    setItems((list) => [...list, { id: newId(), kind, image, aspect, w, ...placeNew(list, w, below) }])
  }

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const { blob, aspect } = await shrinkImage(file, 1600, 'image/jpeg')
      addItem('photo', blob, aspect)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const keepSticker = (made: { blob: Blob; aspect: number }) => {
    void addSticker({ id: newId(), image: made.blob, aspect: made.aspect, createdAt: new Date().toISOString() })
    addItem('sticker', made.blob, made.aspect)
    setMakingSticker(false)
  }

  // Pasting a picture (an iPhone sticker or a copied cut-out keeps its see-through background) makes it a
  // sticker, unless the text box has focus and the clipboard holds text.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      shrinkImage(file, 800, 'image/png')
        .then((made) => {
          void addSticker({ id: newId(), image: made.blob, aspect: made.aspect, createdAt: new Date().toISOString() })
          addItem('sticker', made.blob, made.aspect)
        })
        .catch((err: Error) => setError(err.message))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addSticker])

  const spokenOnly = Boolean(audio) && !text.trim()
  const empty = !text.trim() && !audio && !items.length

  const save = async () => {
    setSaving(true)
    setError(null)
    const now = new Date().toISOString()
    try {
      await onSave({
        id: entry?.id ?? newId(),
        targetId: entry?.targetId ?? target.id,
        when: when || nowLocal(),
        text: text.trim(),
        items,
        audio,
        check: entry?.check,
        createdAt: entry?.createdAt ?? now,
        updatedAt: now,
      })
    } catch {
      setError("Couldn't save the entry. Try again.")
      setSaving(false)
    }
  }

  return (
    <section className="card journal-editor" aria-label={entry ? 'Edit entry' : 'New entry'}>
      <div className="card-head">
        <h2>{entry ? 'Edit entry' : 'New entry'}</h2>
        <span className="language-tag">{target.label} only</span>
      </div>

      <label className="form-label" htmlFor="journal-when">
        Date and time
      </label>
      <input
        id="journal-when"
        className="journal-when"
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />

      <div ref={sheetRef}>
        <JournalSheet
          text={text}
          items={items}
          onTextChange={setText}
          onItemsChange={setItems}
          lang={target.code}
          label={`Your entry, in ${target.label}`}
          placeholder={`Write your entry in ${target.label} only…`}
        />
      </div>

      <div className="journal-tools">
        <button type="button" onClick={() => photoRef.current?.click()}>
          📷 Add a photo
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void addPhoto(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button type="button" onClick={() => setMakingSticker(true)}>
          ✂️ Make a sticker
        </button>
      </div>

      <div className="sticker-tray" aria-label="Your stickers">
        {stickers.length ? (
          stickers.map((s) => (
            <TraySticker key={s.id} sticker={s} onAdd={() => addItem('sticker', s.image, s.aspect)} onRemove={() => removeSticker(s.id)} />
          ))
        ) : (
          <p className="muted">
            Your stickers show up here. Cut one out of a photo, or paste one (on an iPhone, touch and hold
            part of a photo, then Copy).
          </p>
        )}
      </div>

      <div className="journal-audio">
        <p className="form-label">Audio note (optional)</p>
        <AudioNoteRecorder audio={audio} onChange={setAudio} />
        {audio && (
          <p className={spokenOnly ? 'journal-nudge' : 'muted'}>
            Spoke your entry? Type out what you said on the page above, so Mai can check it.
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={save} disabled={saving || empty}>
          {saving ? 'Saving…' : text.trim() ? 'Save and check' : 'Save'}
        </button>
      </div>

      {makingSticker && <StickerMaker onDone={keepSticker} onCancel={() => setMakingSticker(false)} />}
    </section>
  )
}

function TraySticker({ sticker, onAdd, onRemove }: { sticker: Sticker; onAdd: () => void; onRemove: () => void }) {
  const url = objectUrl(sticker.image)
  return (
    <span className="tray-sticker">
      <button type="button" className="tray-add" onClick={onAdd} aria-label="Add this sticker to the page">
        <img src={url} alt="" />
      </button>
      <button type="button" className="tray-remove" onClick={onRemove} aria-label="Delete this sticker">
        ✕
      </button>
    </span>
  )
}
