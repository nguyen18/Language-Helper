import { backendConfigured, callFunction } from './backend'
import type { WordOption } from './grammar'
import type { TargetLanguage } from './languages'

// Alternatives for a word Mai left as it is, for the journal's word box, from the backend's `word-options`
// function: the word's own meanings, the same letters with other accents ("muộn" → muốn, mượn: a real word
// with the wrong tone passes the spellchecker), and other words with the same meaning ("ngô" → bắp).

export type WordAlternatives = { word: WordOption; accents: WordOption[]; synonyms: WordOption[] }

// One request per word per language per visit.
const loaded = new Map<string, Promise<WordAlternatives>>()

export function loadWordOptions(target: TargetLanguage, word: string): Promise<WordAlternatives | null> {
  if (!backendConfigured) return Promise.resolve(null)
  const key = `${target.id}|${word.toLowerCase()}`
  let options = loaded.get(key)
  if (!options) {
    options = callFunction<WordAlternatives>('word-options', { target: target.id, word }, 'Loading other words failed')
    // A failed load is tried again next time.
    options.catch(() => loaded.delete(key))
    loaded.set(key, options)
  }
  return options
}
