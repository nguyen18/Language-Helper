import { useEffect, useState } from 'react'
import type { CheatsheetList } from './cheatsheet'

const STORAGE_KEY = 'language-helper:custom-lists'

export type CustomEntry = { word: string; translation: string }

// A word list the user made on the Cheatsheet page.
export type CustomList = {
  id: string
  title: string
  entries: CustomEntry[]
}

// Custom translations are assumed to be in the same language as the built-in lists.
const TRANSLATION_LANG = { code: 'vi', label: 'Southern Vietnamese' }

// Shapes a custom list like a built-in one so the page can render both the same way.
export function toCheatsheetList(list: CustomList): CheatsheetList {
  return {
    id: list.id,
    title: list.title,
    translationLang: TRANSLATION_LANG,
    // Custom words have one meaning (the user's) and one translation.
    entries: list.entries.map((e) => ({ word: e.word, meanings: [{ id: 'custom', options: [{ text: e.translation }] }] })),
  }
}

function newId(): string {
  // randomUUID needs a secure context (https or localhost); fall back to something unique enough.
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `list-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function loadLists(): CustomList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as CustomList[]
  } catch {
    // Storage unavailable or corrupt; start fresh.
  }
  return []
}

export function useCustomLists() {
  const [lists, setLists] = useState<CustomList[]>(loadLists)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lists))
    } catch {
      // Persistence is a convenience only.
    }
  }, [lists])

  const updateList = (id: string, change: (list: CustomList) => CustomList) =>
    setLists((ls) => ls.map((l) => (l.id === id ? change(l) : l)))

  return {
    lists,
    addList: (title: string) => setLists((ls) => [...ls, { id: newId(), title, entries: [] }]),
    deleteList: (id: string) => setLists((ls) => ls.filter((l) => l.id !== id)),
    addEntry: (id: string, entry: CustomEntry) => updateList(id, (l) => ({ ...l, entries: [...l.entries, entry] })),
    removeEntry: (id: string, word: string) =>
      updateList(id, (l) => ({ ...l, entries: l.entries.filter((e) => e.word !== word) })),
  }
}
