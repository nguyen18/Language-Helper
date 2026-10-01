import { useCallback, useEffect, useState } from 'react'
import type { GrammarCheck } from './grammar'

// Diary entries and the user's stickers, saved in this browser's IndexedDB (photos, stickers and audio
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
}

export type AudioNote = { blob: Blob; seconds: number }

export type DiaryEntry = {
  id: string
  /** The language the entry is written in (TargetLanguage.id), set when it was first saved. */
  targetId: string
  /** The date and time the user gave the entry, as a datetime-local value ("2026-10-01T21:30"). */
  when: string
  text: string
  items: SheetItem[]
  audio?: AudioNote
  /** The latest grammar check; stale when `check.input` isn't the entry's text any more. */
  check?: GrammarCheck
  createdAt: string
  updatedAt: string
}

export type Sticker = { id: string; image: Blob; aspect: number; createdAt: string }

const DB_NAME = 'language-helper'
const ENTRIES = 'diary-entries'
const STICKERS = 'stickers'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(ENTRIES, { keyPath: 'id' })
      req.result.createObjectStore(STICKERS, { keyPath: 'id' })
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
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// Asks the browser not to clear the diary when space runs low. Best effort: some browsers decide alone.
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
const latestFirst = (a: DiaryEntry, b: DiaryEntry) =>
  b.when.localeCompare(a.when) || b.createdAt.localeCompare(a.createdAt)

/** The diary, latest entry first. `error` is set when this browser can't store it (e.g. private mode). */
export function useDiary() {
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    run<DiaryEntry[]>(ENTRIES, 'readonly', (s) => s.getAll())
      .then((all) => setEntries(all.sort(latestFirst)))
      .catch(() => {
        setEntries([])
        setError("This browser can't save diary entries (private browsing can block it).")
      })
  }, [])

  const save = useCallback(async (entry: DiaryEntry) => {
    await run(ENTRIES, 'readwrite', (s) => s.put(entry))
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
      .then((all) => setStickers(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch(() => {})
  }, [])

  const add = useCallback(async (sticker: Sticker) => {
    setStickers((list) => [sticker, ...list])
    await run(STICKERS, 'readwrite', (s) => s.put(sticker)).catch(() => {})
  }, [])

  const remove = useCallback(async (id: string) => {
    setStickers((list) => list.filter((s) => s.id !== id))
    await run(STICKERS, 'readwrite', (s) => s.delete(id)).catch(() => {})
  }, [])

  return { stickers, add, remove }
}

// Object URLs for saved pictures and recordings, one per Blob and kept until the page closes. Revoking
// them as components unmount would break pictures shown in two places at once (an entry and the editor),
// and a diary holds few enough files that keeping them is cheap.
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
