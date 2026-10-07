import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { SpellingCheck } from './spelling'

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

const DB_NAME = 'mai-tutor'
// Before 2026-10-07's rename, the app was "Language Helper" and so was its database.
const OLD_DB_NAME = 'language-helper'
const ENTRIES = 'journal-entries'
// Before 2026-10-01's rename, the journal was the "diary".
const OLD_ENTRIES = 'diary-entries'
const STICKERS = 'stickers'

let dbPromise: Promise<IDBDatabase> | null = null

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 2)
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
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

// Copies the journal from the old database into `to`, then deletes the old one. `add` skips records `to`
// already has, so a copy cut short and redone on the next load doesn't overwrite newer edits.
async function moveOldDb(to: IDBDatabase) {
  const dbs = await indexedDB.databases?.().catch(() => undefined)
  if (!dbs?.some((d) => d.name === OLD_DB_NAME)) return
  const from = await open(OLD_DB_NAME)
  const read = from.transaction([ENTRIES, STICKERS], 'readonly')
  const entries = read.objectStore(ENTRIES).getAll()
  const stickers = read.objectStore(STICKERS).getAll()
  await done(read)
  from.close()
  const write = to.transaction([ENTRIES, STICKERS], 'readwrite')
  for (const [store, req] of [[ENTRIES, entries], [STICKERS, stickers]] as const) {
    for (const record of req.result) write.objectStore(store).add(record).onerror = (e) => e.preventDefault()
  }
  await done(write)
  indexedDB.deleteDatabase(OLD_DB_NAME)
}

function db(): Promise<IDBDatabase> {
  dbPromise ??= open(DB_NAME).then(
    async (db) => {
      // Let go when another tab upgrades or deletes the database, instead of blocking it.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      // Best effort: on failure the old database stays and the next load tries again.
      await moveOldDb(db).catch(() => {})
      return db
    },
    (error) => {
      dbPromise = null
      throw error
    },
  )
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
      .then((all) => setEntries(all.sort(latestFirst)))
      .catch(() => {
        setEntries([])
        setError("This browser can't save journal entries (private browsing can block it).")
      })
  }, [])

  const save = useCallback(async (entry: JournalEntry) => {
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
const EXTRA_CHECKS_KEY = 'mai-tutor:journal-extra-checks'
const EXTRA_CHECKS_EVENT = 'mai-tutor:journal-extra-checks-change'
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
