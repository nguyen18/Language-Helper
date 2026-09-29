// Generates the Cheatsheet's meanings and translations with which-dialect.
//
//   npm run cheatsheet            (from web/)
//
// For each word in TOP_100_WORDS, asks which-dialect for the word's English meanings and their
// Southern Vietnamese translations, and writes public/cheatsheet/top-100.json (fetched by the Cheatsheet
// page when it opens, so the ~1 MB of data isn't in the JavaScript bundle). Run it again after
// changing the word list or updating which-dialect's data.
//
// which-dialect isn't on npm yet, so its data is read from a local checkout: by default
// ../../which-dialect/packages/<lang>/data (override with WHICH_DIALECT_TOOL_DATA=<packages dir>).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTranslator, displayGloss, posName, type Translator } from 'which-dialect'
import { TOP_100_WORDS } from '../src/lib/topWords.ts'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(process.env.WHICH_DIALECT_TOOL_DATA ?? join(WEB, '..', '..', 'which-dialect', 'packages'))
const OUT = join(WEB, 'public', 'cheatsheet', 'top-100.json')

const TO_REGION = 'Southern'
const MAX_TRANSLATIONS = 5
const MAX_GLOSS = 140

// Contractions: the words they're made of, so the Cheatsheet can show "I'll = I + will" and combine the
// parts' translations ("tui" + "sẽ" → "tui sẽ").
const IRREGULAR_CONTRACTIONS: Record<string, [string, string]> = {
  "won't": ['will', 'not'], "can't": ['can', 'not'], "shan't": ['shall', 'not'], "ain't": ['am', 'not'], "let's": ['let', 'us'],
}
const CONTRACTION_ENDINGS: [string, string][] = [
  ["n't", 'not'], ["'ll", 'will'], ["'m", 'am'], ["'re", 'are'], ["'ve", 'have'], ["'d", 'would'], ["'s", 'is'],
]
export function contractionParts(word: string): [string, string] | null {
  const w = word.replace(/’/g, "'")
  const irregular = IRREGULAR_CONTRACTIONS[w.toLowerCase()]
  if (irregular) return irregular
  for (const [ending, full] of CONTRACTION_ENDINGS) {
    if (w.toLowerCase().endsWith(ending) && w.length > ending.length) return [w.slice(0, -ending.length), full]
  }
  return null
}

// English "do" in "don't"/"didn't" is a helper verb with no word of its own in Vietnamese (or Spanish),
// so it isn't translated.
const HELPERS = new Set(['do', 'does', 'did'])
// Which sense of each part to translate. Anything not listed is a pronoun ("I", "it", "we"…), translated
// in a casual register (Language Helper is about casual chat: Southern "tui" for "I") with more options,
// since the right pronoun depends on who you're talking to.
type PartHint = { pos: string; meaning?: string; register?: 'casual' | 'neutral' | 'polite' }
const PRONOUN_HINT: PartHint = { pos: 'pron', register: 'casual' }
const PART_HINTS: Record<string, PartHint> = {
  am: { pos: 'verb', meaning: 'identical equivalent' },
  is: { pos: 'verb', meaning: 'identical equivalent' },
  are: { pos: 'verb', meaning: 'identical equivalent' },
  will: { pos: 'verb', meaning: 'future tense' },
  shall: { pos: 'verb', meaning: 'future tense' },
  would: { pos: 'verb', meaning: 'conditional' },
  have: { pos: 'verb', meaning: 'perfect' },
  can: { pos: 'verb', meaning: 'able' },
  not: { pos: 'adv' },
  that: { pos: 'det', meaning: 'demonstrative' },
  let: { pos: 'verb' },
}
const MAX_PART_OPTIONS = 4
const MAX_PRONOUN_OPTIONS = 6

async function partsOf(tr: Translator, word: string) {
  const parts = contractionParts(word)
  if (!parts) return undefined
  return Promise.all(
    parts.map(async (part) => {
      if (HELPERS.has(part.toLowerCase())) return { word: part, helper: true, options: [] }
      const hint = PART_HINTS[part.toLowerCase()] ?? PRONOUN_HINT
      const limit = hint === PRONOUN_HINT ? MAX_PRONOUN_OPTIONS : MAX_PART_OPTIONS
      const [g] = await tr.translate(part, { from: 'en', to: 'vi', toRegion: TO_REGION, limit, ...hint })
      return {
        word: part,
        options: (g?.translations ?? []).map((t) => ({ text: t.word, gloss: cut(t.gloss), ...(t.labels.length ? { labels: t.labels } : {}) })),
      }
    }),
  )
}

const cut = (s: string, n = MAX_GLOSS) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
// Stable id for a meaning, so a user's picked meaning survives regenerating. Definitions can share a
// long opening ("The speaker or writer, referred to as the grammatical subject/object"), so the id uses
// up to 80 characters, and `unique` adds -2, -3… if two meanings of a word still match.
const meaningId = (pos: string, gloss: string) =>
  `${pos}:${gloss.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)}`
function unique(ids: string[]): string[] {
  const seen = new Map<string, number>()
  return ids.map((id) => {
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    return n === 1 ? id : `${id}-${n}`
  })
}

async function main() {
  const tr = createTranslator({
    load: (lang) => async (path) => JSON.parse(await readFile(join(DATA, lang, 'data', path), 'utf8')),
  })

  const words = []
  for (const word of TOP_100_WORDS) {
    // Every meaning, including ones with no translation (no cap: owner's request), so users can pick any.
    const groups = await tr.translate(word, { from: 'en', to: 'vi', toRegion: TO_REGION, limit: MAX_TRANSLATIONS, allSenses: true })
    const meanings = groups.map((g) => ({
      id: meaningId(g.source.pos, displayGloss(g.source.glosses)),
      pos: g.source.pos,
      posName: posName(g.source.pos),
      gloss: cut(displayGloss(g.source.glosses)),
      ...(g.source.via ? { via: g.source.via } : {}),
      ...(g.source.labels.length ? { labels: g.source.labels } : {}),
      ...(g.source.examples?.[0] ? { example: cut(g.source.examples[0].text, 160) } : {}),
      translations: g.translations.map((t) => ({
        text: t.word,
        gloss: cut(t.gloss),
        ...(t.regionTagged ? { regions: t.regions } : {}),
        ...(t.labels.length ? { labels: t.labels } : {}),
        ...(t.examples?.[0]
          ? { example: { text: cut(t.examples[0].text, 160), ...(t.examples[0].translation ? { translation: cut(t.examples[0].translation, 160) } : {}) } }
          : {}),
      })),
    }))
    const ids = unique(meanings.map((m) => m.id))
    meanings.forEach((m, i) => (m.id = ids[i]))
    const parts = await partsOf(tr, word)
    words.push({ word, meanings, ...(parts ? { parts } : {}) })
    const first = meanings.find((m) => m.translations.length)
    console.log(`${word.padEnd(10)} ${meanings.length} meanings; default: [${first?.pos}] ${first?.translations.map((t) => t.text).join(', ') || '—'}`)
    if (parts) console.log(`           parts: ${parts.map((p) => `${p.word} → ${'helper' in p ? '(helper)' : p.options.map((o) => o.text).join('/') || '—'}`).join(' + ')}`)
  }

  const out = {
    generatedBy: 'which-dialect (scripts/build-cheatsheet.ts)',
    source: 'Wiktionary, via Kaikki.org; CC BY-SA 4.0',
    from: 'en',
    to: 'vi',
    toRegion: TO_REGION,
    words,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(out))
  const size = JSON.stringify(out).length
  console.log(`\nWrote ${OUT} (${(size / 1024).toFixed(0)} KB, ${words.filter((w) => w.meanings.some((m) => m.translations.length)).length}/${words.length} words translated)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
