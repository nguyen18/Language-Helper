import { DEFAULT_TARGET, type TargetLanguage } from './languages'
import type { PronounTable } from './pronounTable'

// Cheatsheet lists: English words, each with one or more meanings (part of speech + definition), and
// for each meaning, translation options. The built-in list comes from which-dialect (see
// scripts/build-cheatsheet.ts, which writes public/cheatsheet/top-100.<language id>.json); custom lists come from
// customLists.ts.

export type Example = { text: string; translation?: string }

export type TranslationOption = {
  // Shown next to the word in the translation color (--translation).
  text: string
  // What this word means in English (its dictionary definition), shown as its "when to use it" note.
  gloss?: string
  // Set when the dictionary tags this word for particular regions, e.g. ["Southern"].
  regions?: string[]
  // Usage labels, e.g. colloquial, formal.
  labels?: string[]
  example?: Example
}

export type Meaning = {
  // Stable id for saving which meaning the user picked.
  id: string
  // Part of speech code and readable name, e.g. "adj" / "Adjective". Custom words have none.
  pos?: string
  posName?: string
  // The English definition of this meaning.
  gloss?: string
  // How the listed word leads to this meaning, e.g. "Misspelling of don't".
  via?: string
  labels?: string[]
  // An English example sentence for this meaning.
  example?: string
  // Translations, best first; the first is the default. Empty when the dictionary has none.
  options: TranslationOption[]
}

// One part of a contraction ("I'll" = "I" + "will") with its own translation options.
export type ContractionPart = {
  word: string
  // English-only helper words ("do" in "don't") have no translation of their own.
  helper?: boolean
  options: TranslationOption[]
}

export type CheatsheetEntry = {
  word: string
  // Most relevant first; the first is the default meaning.
  meanings: Meaning[]
  // Contractions only: the words it's made of, whose translations combine into one ("tui sẽ").
  parts?: ContractionPart[]
}

export type CheatsheetList = {
  id: string
  title: string
  // Optional line under the title.
  description?: string
  // Language of the translations, e.g. for the lang attribute and the legend.
  translationLang?: { code: string; label: string }
  // Credit line for generated data (required by its CC BY-SA license when shown).
  attribution?: string
  // "Who are you talking to?" table for the pronoun words (I, me, my, you, your, we, she, her, him, they,
  // them, and contractions with "I"), from which-dialect via the generated data.
  pronounTable?: PronounTable
  // Most common first; the page shows each word's rank.
  entries: CheatsheetEntry[]
}

type Generated = {
  words: {
    word: string
    meanings: (Omit<Meaning, 'options'> & { translations: TranslationOption[] })[]
    parts?: ContractionPart[]
  }[]
  pronounTable?: PronounTable
}

// The built-in list: the owner's top 100 words (topWords.ts), with meanings and translations into the
// language picked in Settings (languages.ts), from which-dialect. Regenerate with `npm run cheatsheet`.
// Each language's data (~1.4 MB) is a static file fetched once, when the Cheatsheet first shows it,
// rather than part of the JavaScript bundle.
const top100 = new Map<string, Promise<CheatsheetList>>()

// The list id keys the user's picks (cheatsheetPicks.ts), so each language keeps its own. Southern
// Vietnamese keeps the id it had before there was a choice, so picks made then still apply.
const listId = (target: TargetLanguage) => (target.id === DEFAULT_TARGET.id ? 'top-100' : `top-100:${target.id}`)

export function loadTop100(target: TargetLanguage): Promise<CheatsheetList> {
  const cached = top100.get(target.id)
  if (cached) return cached
  const loading = fetch(`${import.meta.env.BASE_URL}cheatsheet/top-100.${target.id}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Couldn't load the cheatsheet (${res.status})`)
      return res.json() as Promise<Generated>
    })
    .then((data) => ({
      id: listId(target),
      title: '100 most common words you use',
      translationLang: { code: target.code, label: target.label },
      attribution: 'Meanings and translations from Wiktionary (CC BY-SA 4.0), via which-dialect.',
      entries: data.words.map(({ word, meanings, parts }) => ({
        word,
        meanings: meanings.map(({ translations, ...meaning }) => ({ ...meaning, options: translations })),
        ...(parts ? { parts } : {}),
      })),
      ...(data.pronounTable ? { pronounTable: data.pronounTable } : {}),
    }))
    .catch((err: unknown) => {
      // Let a later visit retry.
      top100.delete(target.id)
      throw err
    })
  top100.set(target.id, loading)
  return loading
}
