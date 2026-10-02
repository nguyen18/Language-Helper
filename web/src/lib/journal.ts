import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CaptionCheck, SpellingCheck } from './spelling'

// Journal entries and the user's stickers, saved in this browser's IndexedDB (photos, stickers and audio
// are files, too big for localStorage). There are no accounts yet, so they stay on this device.

/** A photo or sticker placed on the entry sheet. Sizes are fractions of the sheet's width, so it scales. */
export type SheetItem = {
  id: string
  kind: 'photo' | 'sticker'
  image: Blob
  /** Top-left corner: x and y, both as fractions of the sheet's width. */
  x: number
  y: number
  /** Width as a fraction of the sheet's width; the height follows from `aspect` (height / width). */
  w: number
  aspect: number
  /** Degrees, clockwise. */
  rotation: number
  /**
   * A label under the picture, like a zine sticker's, in the language being learned (vocabulary practice):
   * English is fine, Mai fills in the word ("matcha latte" → "trà xanh sữa").
   */
  caption?: string
  /** Mai's check of the caption; stale when its `input` isn't the caption any more. */
  captionCheck?: CaptionCheck
}

export type AudioNote = { blob: Blob; seconds: number }

export type JournalEntry = {
  id: string
  /** The language the entry is written in (TargetLanguage.id), set when it was first saved. */
  targetId: string
  /** The date and time the user gave the entry, as a datetime-local value ("2026-10-01T21:30"). */
  when: string
  text: string
  items: SheetItem[]
  audio?: AudioNote
  /** The latest spelling check; stale when `check.input` isn't the entry's text any more. */
  check?: SpellingCheck
  createdAt: string
  updatedAt: string
}

export type Sticker = { id: string; image: Blob; aspect: number; createdAt: string }

const DB_NAME = 'language-helper'
const ENTRIES = 'journal-entries'
// Before 2026-10-01's rename, the journal was the "diary".
const OLD_ENTRIES = 'diary-entries'
const STICKERS = 'stickers'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = (e) => {
      const db = req.result
      if (e.oldVersion < 1) db.createObjectStore(STICKERS, { keyPath: 'id' })
      db.createObjectStore(ENTRIES, { keyPath: 'id' })
      // Version 1 called the journal a diary: move its entries over.
      if (db.objectStoreNames.contains(OLD_ENTRIES)) {
        const tx = req.transaction!
        const read = tx.objectStore(OLD_ENTRIES).getAll()
        read.onsuccess = () => {
          for (const entry of read.result) tx.objectStore(ENTRIES).put(entry)
          db.deleteObjectStore(OLD_ENTRIES)
        }
      }
    }
    req.onsuccess = () => {
      // Let go when another tab upgrades or deletes the database, instead of blocking it.
      req.result.onversionchange = () => {
        req.result.close()
        dbPromise = null
      }
      resolve(req.result)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

async function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(store, mode)
  return new Promise((resolve, reject) => {
    const req = op(tx.objectStore(store))
    tx.oncomplete = () => resolve(req.result)
    // A transaction can fail without an error object (aborted): say which store and what, then.
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error(`Writing to ${store} failed`))
    tx.onabort = () => reject(tx.error ?? req.error ?? new Error(`Writing to ${store} was aborted`))
  })
}

// Pictures and recordings are stored as bytes (ArrayBuffer + type), not Blobs: iPhone Safari can fail to store
// Blobs in IndexedDB ("UnknownError: Error preparing Blob/File data", e.g. in Private Browsing), which broke
// saving entries with a photo or sticker (owner's report 2026-10-02). They're turned back into Blobs when
// read; entries and stickers stored as Blobs before still read as they are.
type StoredFile = { bytes: ArrayBuffer; type: string }
const isStoredFile = (v: unknown): v is StoredFile =>
  typeof v === 'object' && v !== null && (v as StoredFile).bytes instanceof ArrayBuffer
const toStored = async (b: Blob): Promise<StoredFile> => ({ bytes: await b.arrayBuffer(), type: b.type })
const toBlob = (v: Blob | StoredFile): Blob => (isStoredFile(v) ? new Blob([v.bytes], { type: v.type }) : v)

async function storeEntry(e: JournalEntry) {
  return {
    ...e,
    items: await Promise.all(e.items.map(async (i) => ({ ...i, image: await toStored(i.image) }))),
    ...(e.audio ? { audio: { ...e.audio, blob: await toStored(e.audio.blob) } } : {}),
  }
}

function readEntry(e: JournalEntry): JournalEntry {
  return {
    ...e,
    items: e.items.map((i) => ({ ...i, image: toBlob(i.image as Blob | StoredFile) })),
    ...(e.audio ? { audio: { ...e.audio, blob: toBlob(e.audio.blob as Blob | StoredFile) } } : {}),
  }
}

// Asks the browser not to clear the journal when space runs low. Best effort: some browsers decide alone.
function askToPersist() {
  void navigator.storage?.persist?.().catch(() => {})
}

export const newId = () => crypto.randomUUID()

/** "2026-10-01T21:30" for now, in local time, for a datetime-local input. */
export function nowLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// Latest on top: by the date the user gave, then by when the entry was made.
const latestFirst = (a: JournalEntry, b: JournalEntry) =>
  b.when.localeCompare(a.when) || b.createdAt.localeCompare(a.createdAt)

/** The journal, latest entry first. `error` is set when this browser can't store it (e.g. private mode). */
export function useJournal() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    run<JournalEntry[]>(ENTRIES, 'readonly', (s) => s.getAll())
      .then((all) => setEntries(all.map(readEntry).sort(latestFirst)))
      .catch(() => {
        setEntries([])
        setError("This browser can't save journal entries (private browsing can block it).")
      })
  }, [])

  const save = useCallback(async (entry: JournalEntry) => {
    const stored = await storeEntry(entry)
    await run(ENTRIES, 'readwrite', (s) => s.put(stored))
    askToPersist()
    setEntries((list) => [...(list ?? []).filter((e) => e.id !== entry.id), entry].sort(latestFirst))
  }, [])

  const remove = useCallback(async (id: string) => {
    await run(ENTRIES, 'readwrite', (s) => s.delete(id))
    setEntries((list) => (list ?? []).filter((e) => e.id !== id))
  }, [])

  return { entries, error, save, remove }
}

/** Stickers the user has made, newest first, to reuse on any entry. */
export function useStickers() {
  const [stickers, setStickers] = useState<Sticker[]>([])

  useEffect(() => {
    run<Sticker[]>(STICKERS, 'readonly', (s) => s.getAll())
      .then((all) =>
        setStickers(
          all
            .map((st) => ({ ...st, image: toBlob(st.image as Blob | StoredFile) }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        ),
      )
      .catch(() => {})
  }, [])

  const add = useCallback(async (sticker: Sticker) => {
    setStickers((list) => [sticker, ...list])
    const stored = { ...sticker, image: await toStored(sticker.image) }
    await run(STICKERS, 'readwrite', (s) => s.put(stored)).catch(() => {})
  }, [])

  const remove = useCallback(async (id: string) => {
    setStickers((list) => list.filter((s) => s.id !== id))
    await run(STICKERS, 'readwrite', (s) => s.delete(id)).catch(() => {})
  }, [])

  return { stickers, add, remove }
}

// Object URLs for saved pictures and recordings, one per Blob and kept until the page closes. Revoking
// them as components unmount would break pictures shown in two places at once (an entry and the editor),
// and a journal holds few enough files that keeping them is cheap.
const objectUrls = new WeakMap<Blob, string>()

/** An object URL for a Blob, to show it in <img> or <audio>. */
export function objectUrl(blob: Blob): string {
  let url = objectUrls.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    objectUrls.set(blob, url)
  }
  return url
}

// The journal's extra checks (other regions' words, one word for "I"), off by default: the review is a
// spellchecker unless the learner turns them on in Settings. Shared by every page, in sync across tabs.
const EXTRA_CHECKS_KEY = 'language-helper:journal-extra-checks'
const EXTRA_CHECKS_EVENT = 'language-helper:journal-extra-checks-change'
// Used when localStorage is unavailable: the choice then lasts until the page reloads.
let unsavedExtraChecks = false

function readExtraChecks(): boolean {
  try {
    const saved = localStorage.getItem(EXTRA_CHECKS_KEY)
    return saved === null ? unsavedExtraChecks : saved === 'true'
  } catch {
    return unsavedExtraChecks
  }
}

export function useJournalExtraChecks(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore((onChange) => {
    window.addEventListener('storage', onChange)
    window.addEventListener(EXTRA_CHECKS_EVENT, onChange)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener(EXTRA_CHECKS_EVENT, onChange)
    }
  }, readExtraChecks)
  const set = (value: boolean) => {
    unsavedExtraChecks = value
    try {
      localStorage.setItem(EXTRA_CHECKS_KEY, String(value))
    } catch {
      // Kept in memory instead.
    }
    window.dispatchEvent(new Event(EXTRA_CHECKS_EVENT))
  }
  return [on, set]
}
