import { useEffect, useState } from 'react'
import { toEntry, wordKey, type CheatsheetEntry, type GeneratedWord, type WordBank } from './cheatsheet'
import type { TargetLanguage } from './languages'
import { backendConfigured, callFunction } from './backend'

// Translations for words the pre-built bank doesn't have, from the backend's `translate` function
// (supabase/functions/translate), which translates with which-dialect and caches every word for
// everyone. Without the backend's settings (see lib/backend.ts), those words show as not translated.

// The function takes up to 25 words per request.
const CHUNK = 25

// Results already fetched in this visit, by language and word, so switching back and forth or
// editing the list doesn't ask again.
const fetched = new Map<string, CheatsheetEntry>()
const cacheKey = (target: TargetLanguage, word: string) => `${target.id}|${wordKey(word)}`

async function fetchChunk(target: TargetLanguage, words: string[]): Promise<void> {
  const { entries } = await callFunction<{ entries: GeneratedWord[] }>(
    'translate',
    { target: target.id, words },
    'Translating failed',
  )
  // Keyed by the word asked for, which the function echoes back.
  for (const e of entries) fetched.set(cacheKey(target, e.word), toEntry(e))
}

/**
 * Entries for the user's words in order: from the bank, from this visit's fetches, or, while the
 * backend works, a placeholder with `status: 'translating'` (or 'failed', with `retry` to try again).
 */
export function useWordEntries(target: TargetLanguage, bank: WordBank, words: string[]) {
  const [, setVersion] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [attempt, setAttempt] = useState(0)

  const missing = words.filter((w) => !bank.entries.has(wordKey(w)) && !fetched.has(cacheKey(target, w)))
  const missingKey = missing.join('\n')

  useEffect(() => {
    if (!missingKey || !backendConfigured) return
    const todo = missingKey.split('\n')
    let cancelled = false
    const chunks = Array.from({ length: Math.ceil(todo.length / CHUNK) }, (_, i) => todo.slice(i * CHUNK, (i + 1) * CHUNK))
    // Two requests at a time: results show as each chunk arrives.
    const queue = [...chunks]
    const worker = async () => {
      for (let chunk = queue.shift(); chunk; chunk = queue.shift()) {
        try {
          await fetchChunk(target, chunk)
          if (cancelled) continue
          setVersion((v) => v + 1)
          // Words that failed before and now worked (after Try again, or re-added).
          setFailed((f) => {
            const keys = chunk.map((w) => cacheKey(target, w))
            return keys.some((k) => f.has(k)) ? new Set([...f].filter((k) => !keys.includes(k))) : f
          })
        } catch {
          if (!cancelled) setFailed((f) => new Set([...f, ...chunk.map((w) => cacheKey(target, w))]))
        }
      }
    }
    void Promise.all([worker(), worker()])
    return () => {
      cancelled = true
    }
  }, [target, missingKey, attempt])

  const entries: CheatsheetEntry[] = words.map(
    (word) =>
      bank.entries.get(wordKey(word)) ??
      fetched.get(cacheKey(target, word)) ?? {
        word,
        meanings: [],
        status: !backendConfigured || failed.has(cacheKey(target, word)) ? 'failed' : 'translating',
      },
  )
  return {
    entries,
    translating: entries.some((e) => e.status === 'translating'),
    failedCount: entries.filter((e) => e.status === 'failed').length,
    retry: () => {
      setFailed(new Set())
      setAttempt((a) => a + 1)
    },
  }
}
