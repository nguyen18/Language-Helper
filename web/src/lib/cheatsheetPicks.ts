import { useEffect, useState } from 'react'

// v2 (2026-09-27): picks are per meaning. Picks saved by the old format (one translation per word) are
// left behind in `language-helper:cheatsheet-picks` and ignored.
const STORAGE_KEY = 'language-helper:cheatsheet-picks-v2'

// Keys (see meaningKey/optionKey) -> the picked meaning id, or the picked translation's text.
// Anything without a pick shows its first (default) meaning or translation.
export type Picks = Record<string, string>

/** Which meaning of a word the user picked. */
export const meaningKey = (listId: string, word: string) => `meaning|${listId}|${word}`

/** Which translation the user starred for one meaning of a word. */
export const optionKey = (listId: string, word: string, meaningId: string) => `option|${listId}|${word}|${meaningId}`

/**
 * Which translation the user starred for a contraction part ("I" in "I'm"/"I'll"). Keyed by the part
 * word, so one pick applies to every contraction with that part.
 */
export const partKey = (listId: string, part: string) => `part|${listId}|${part.toLowerCase()}`

/** Which "who are you talking to?" row the user picked; shared by every pronoun word in a list. */
export const pronounKey = (listId: string) => `pronoun|${listId}`

function loadPicks(): Picks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Picks
  } catch {
    // Storage unavailable or corrupt; start fresh.
  }
  return {}
}

export function usePicks() {
  const [picks, setPicks] = useState<Picks>(loadPicks)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(picks))
    } catch {
      // Persistence is a convenience only.
    }
  }, [picks])

  // Pass null to go back to the default.
  const setPick = (key: string, value: string | null) =>
    setPicks((p) => {
      const next = { ...p }
      if (value === null) delete next[key]
      else next[key] = value
      return next
    })

  return { picks, setPick }
}
