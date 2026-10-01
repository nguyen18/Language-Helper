// Alternatives for a word the learner wrote that Mai left as it is, for the journal's word box:
// POST { target, word } returns { word, accents, synonyms }, each a WordOption ({ text, meanings }):
//
// - word: the word itself, with its meanings, so the learner can check it means what they meant.
// - accents: the same letters with other accents, most common first ("muộn" → muốn, mượn), for languages
//   written in syllables: a real word with the wrong tone passes the spellchecker, and this is how the
//   learner catches it.
// - synonyms: other words with the same meaning from the dictionary, often another region's word
//   ("ngô" → "bắp").
//
// Called from the browser with the publishable key (web/src/lib/wordOptions.ts).

import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import * as wd from 'which-dialect'
import { dataUrl, TARGETS, withCors } from '../_shared/journal.ts'
import { describeWord } from '../_shared/words.ts'

const MAX_WORD_LENGTH = 40
const MAX_ACCENTS = 5
const MAX_SYNONYMS = 6
// Synonyms are read from this many of the word's first senses.
const SYNONYM_SENSES = 3

const dictionaries = new Map<string, wd.Dictionary>()
const dictionary = (lang: string) => {
  if (!dictionaries.has(lang)) dictionaries.set(lang, wd.createDictionary({ lang, baseUrl: dataUrl(lang) }))
  return dictionaries.get(lang)!
}

const handler = withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
  const body = await req.json().catch(() => null)
  const target = TARGETS[body?.target]
  const word: unknown = body?.word
  if (!target || typeof word !== 'string' || !word.trim() || word.length > MAX_WORD_LENGTH) {
    return Response.json(
      { error: `Send { target: one of ${Object.keys(TARGETS).join(', ')}, word: 1–${MAX_WORD_LENGTH} characters }` },
      { status: 400 },
    )
  }
  const dict = dictionary(target.code)
  const lower = word.trim().normalize('NFC').toLowerCase()
  const [meta, syllables, entries] = await Promise.all([dict.meta(), dict.syllables(), dict.lookup(lower).catch(() => [])])
  const allRegions = meta.regions.length
  const describe = (text: string) => describeWord(dict, wd.posName, text, allRegions)

  // Same letters, other accents: syllables that are this one without its accents, most common first.
  const bare = wd.plain(lower)
  const accentWords = /\s/.test(lower)
    ? []
    : Object.entries(syllables)
        .filter(([s]) => s !== lower && wd.plain(s) === bare)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_ACCENTS * 2)
        .map(([s]) => s)

  const synonymWords = [
    ...new Set(
      entries.flatMap((e) => e.senses.slice(0, SYNONYM_SENSES).flatMap((s) => s.synonyms ?? [])).filter((s) => s.toLowerCase() !== lower),
    ),
  ].slice(0, MAX_SYNONYMS)

  const [self, accents, synonyms] = await Promise.all([
    describe(lower),
    Promise.all(accentWords.map(describe)),
    Promise.all(synonymWords.map(describe)),
  ])
  // Only real words: a syllable with no meaning of its own (part of longer words) isn't an alternative.
  return Response.json({
    word: self,
    accents: accents.filter((a) => a.meanings.length).slice(0, MAX_ACCENTS),
    synonyms: synonyms.filter((s) => s.meanings.length),
  })
})

export default withCors(handler)
