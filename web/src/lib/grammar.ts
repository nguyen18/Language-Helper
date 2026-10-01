import { callFunction } from './backend'
import type { TargetLanguage } from './languages'

// Corrections for journal entries, by the backend's `check-grammar` function
// (supabase/functions/check-grammar), which runs which-dialect's journal review. By default it's a
// spellchecker: English words get the target-language word for the region, missing accents are added, and
// English sentences or clauses that follow a sentence frame get the frame's wording. The journal's setting
// can turn on two more checks (other regions' words, one word for "I"). Corrections are word by word, so
// word order and grammar aren't fixed, and no change means nothing was found, not that it's certainly right.

// which-dialect's ReviewChange: `to` is '' when a word is left out (Vietnamese has no "the"). `options`
// (added by check-grammar) lists every word the checker suggested, best first, when there's more than one,
// each with its first few meanings from the dictionary (none for English words: the web side shows their
// Cheatsheet entry instead).
export type OptionMeaning = { pos: string; posName: string; gloss: string; regions?: string[]; labels?: string[] }
export type WordOption = { text: string; meanings: OptionMeaning[] }
export type ReviewChange = { from: string; to: string; why: string; kind: string; options?: WordOption[] }
export type ReviewHint = { rule: string; text: string; message: string; suggestions: string[] }
export type ReviewFrame = { id: string; en: string; text: string }

export type ReviewSentence = {
  /** Offsets in Review.text. */
  start: number
  end: number
  original: string
  corrected: string
  changes: ReviewChange[]
  /** Suggestions that weren't applied, e.g. "end with ạ". */
  hints: ReviewHint[]
  /** Sentence frames the sentence follows or was built from: the frame's English and its pattern. */
  frames: ReviewFrame[]
  /** English words with no translation, left as written. */
  unchecked: string[]
}

export type Review = {
  /** The entry in Unicode NFC form; sentence offsets refer to it. */
  text: string
  corrected: string
  sentences: ReviewSentence[]
}

export type GrammarCheck = {
  /** The text that was sent, to tell whether the entry changed since. */
  input: string
  /** Whether the extra checks (regional words, one word for "I") were on. */
  extraChecks: boolean
  review: Review
  /** Hints the learner chose to use, as `${sentence}:${hint}` indexes; applied to the corrected copy. */
  acceptedHints?: string[]
  /** Words the learner picked instead of a change's `to`, by `changeKey`. */
  wordPicks?: Record<string, string>
  checkedAt: string
}

export async function checkGrammar(target: TargetLanguage, input: string, extraChecks: boolean): Promise<GrammarCheck> {
  const checks = extraChecks ? { dialect: true, 'pronoun-consistency': true } : {}
  const review = await callFunction<Review>(
    'check-grammar',
    { target: target.id, text: input, checks },
    'Checking the grammar failed',
  )
  return { input, extraChecks, review, checkedAt: new Date().toISOString() }
}

/** How each kind of change is named and colored (`data-kind` in CSS). */
export const CHANGE_KINDS: Record<string, { label: string; color: string }> = {
  spelling: { label: 'Accents and spelling', color: 'spelling' },
  'foreign-word': { label: 'English word', color: 'foreign' },
  frame: { label: 'Sentence frame', color: 'frame' },
  dialect: { label: 'Regional word', color: 'dialect' },
  'pronoun-consistency': { label: 'Pronoun', color: 'pronoun' },
  'pronoun-pair': { label: 'Pronoun', color: 'pronoun' },
  'pronoun-relationship': { label: 'Pronoun', color: 'pronoun' },
  'polite-ending': { label: 'Politeness', color: 'pronoun' },
}
export const kindOf = (kind: string) => CHANGE_KINDS[kind] ?? { label: 'Correction', color: 'spelling' }

/**
 * The review with the learner's accepted hints applied: each one replaces its word in the sentence's
 * corrected text with its first suggestion and becomes a change, so it's highlighted like the others.
 */
export function withAcceptedHints(check: GrammarCheck): Review {
  const accepted = new Set(check.acceptedHints ?? [])
  if (!accepted.size) return check.review
  const sentences = check.review.sentences.map((s, si) => {
    let corrected = s.corrected
    const changes = [...s.changes]
    s.hints.forEach((h, hi) => {
      const to = h.suggestions[0]
      const at = to === undefined ? -1 : corrected.lastIndexOf(h.text)
      if (!accepted.has(`${si}:${hi}`) || at < 0) return
      corrected = corrected.slice(0, at) + to + corrected.slice(at + h.text.length)
      changes.push({ from: h.text, to, why: h.message, kind: h.rule })
    })
    return { ...s, corrected, changes }
  })
  let corrected = ''
  let at = 0
  for (const s of sentences) {
    corrected += check.review.text.slice(at, s.start) + s.corrected
    at = s.end
  }
  return { ...check.review, corrected: corrected + check.review.text.slice(at), sentences }
}

/** A run of the corrected entry; `change` is set on the words a change put there. */
export type Piece = { text: string; change?: ReviewChange }

const isLetter = (ch: string | undefined) => !!ch && /[\p{L}\p{M}\p{N}]/u.test(ch)

/**
 * A corrected sentence in pieces, each change's words marked with the change. The review gives each change's
 * `from` and `to` but not where `to` landed in the corrected sentence, so each is placed at the occurrence of
 * `to` (as whole words) nearest to where `from` was in the original, longest first so phrases aren't split.
 */
export function sentencePieces(s: ReviewSentence): Piece[] {
  const text = s.corrected
  const placed: { start: number; end: number; change: ReviewChange }[] = []
  const free = (start: number, end: number) => placed.every((p) => end <= p.start || start >= p.end)
  const order = s.changes.filter((c) => c.to).sort((a, b) => b.to.length - a.to.length)
  for (const change of order) {
    const from = s.original.indexOf(change.from)
    const expected = from < 0 ? 0 : (from / Math.max(1, s.original.length)) * text.length
    let best = -1
    for (let i = text.indexOf(change.to); i >= 0; i = text.indexOf(change.to, i + 1)) {
      const end = i + change.to.length
      if (isLetter(text[i - 1]) || isLetter(text[end]) || !free(i, end)) continue
      if (best < 0 || Math.abs(i - expected) < Math.abs(best - expected)) best = i
    }
    if (best >= 0) placed.push({ start: best, end: best + change.to.length, change })
  }
  placed.sort((a, b) => a.start - b.start)
  const out: Piece[] = []
  let at = 0
  for (const p of placed) {
    if (p.start > at) out.push({ text: text.slice(at, p.start) })
    out.push({ text: text.slice(p.start, p.end), change: p.change })
    at = p.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** A hint with its key (`${sentence}:${hint}`), for accepting it. */
export type KeyedHint = ReviewHint & { key: string }

/** Every change, hint and frame of the review, gathered across sentences. Frames are listed once each. */
export function reviewNotes(review: Review) {
  const frames = new Map<string, ReviewFrame>()
  for (const s of review.sentences) for (const f of s.frames) frames.set(f.id, f)
  return {
    changes: review.sentences.flatMap((s) => s.changes),
    hints: review.sentences.flatMap((s, si) => s.hints.map((h, hi): KeyedHint => ({ ...h, key: `${si}:${hi}` }))),
    frames: [...frames.values()],
    unchecked: review.sentences.flatMap((s) => s.unchecked),
  }
}

/** A change's key for `wordPicks`: its sentence and its place in that sentence's changes. */
export const changeKey = (sentence: number, change: number) => `${sentence}:${change}`

/** The word to show for a change: the learner's pick (keeping a capital, like the review's), or its `to`. */
export function shownWord(change: ReviewChange, pick: string | undefined): string {
  return pick === undefined ? change.to : keepCapital(change.to, pick)
}

// "Tôi" → pick "tới" shows as "Tới": a pick keeps the capital of the word it replaces.
function keepCapital(word: string, pick: string): string {
  const first = word.charAt(0)
  return first && first !== first.toLowerCase() ? pick.charAt(0).toUpperCase() + pick.slice(1) : pick
}
