import { callFunction } from './backend'
import type { TargetLanguage } from './languages'

// Grammar checking for journal entries, by the backend's `check-grammar` function
// (supabase/functions/check-grammar), which runs which-dialect's journal review: the grammar checker on
// the whole entry, then each sentence against sentence frames, with English parts put into the target
// language where a frame or a short translation covers them. It only speaks up when it's confident, so no
// changes means nothing was found, not that the text is certainly right.

// which-dialect's ReviewChange: `from` is empty when a missing word was added.
export type ReviewChange = { from: string; to: string; why: string; kind: string }
export type ReviewHint = { rule: string; text: string; message: string; suggestions: string[] }
export type ReviewFrame = { id: string; en: string; text: string }

export type ReviewSentence = {
  /** Offsets in Review.text. */
  start: number
  end: number
  original: string
  corrected: string
  changes: ReviewChange[]
  hints: ReviewHint[]
  /** Sentence frames the sentence follows or was built from: the frame's English and its pattern. */
  frames: ReviewFrame[]
  /** Parts it couldn't handle (longer English that follows no frame), left as written. */
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
  review: Review
  checkedAt: string
}

export async function checkGrammar(target: TargetLanguage, input: string): Promise<GrammarCheck> {
  const review = await callFunction<Review>('check-grammar', { target: target.id, text: input }, 'Checking the grammar failed')
  return { input, review, checkedAt: new Date().toISOString() }
}

/** A run of the corrected entry; `changed` marks words the review changed or added. */
export type Piece = { text: string; changed?: boolean }

/**
 * The corrected entry in pieces, with changed words marked. The review says what changed but not where in
 * the corrected sentence, so each sentence's original and corrected words are compared (longest common
 * subsequence): words not kept from the original are the changes.
 */
export function correctedPieces(review: Review): Piece[] {
  const pieces: Piece[] = []
  let at = 0
  for (const s of review.sentences) {
    if (s.start > at) pieces.push({ text: review.text.slice(at, s.start) })
    pieces.push(...(s.corrected === s.original ? [{ text: s.corrected }] : diffWords(s.original, s.corrected)))
    at = s.end
  }
  if (at < review.text.length) pieces.push({ text: review.text.slice(at) })
  return merge(pieces)
}

// Words (letters, marks, digits, apostrophes) and the runs between them. Unicode-aware, so it works for any
// language written with spaces between words.
const tokens = (text: string) => text.match(/[\p{L}\p{M}\p{N}'’]+|[^\p{L}\p{M}\p{N}'’]+/gu) ?? []
const isWord = (t: string) => /[\p{L}\p{M}\p{N}]/u.test(t)

function diffWords(original: string, corrected: string): Piece[] {
  const a = tokens(original)
  const b = tokens(corrected)
  // lcs[i][j]: the longest common run of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const kept = new Array<boolean>(b.length).fill(false)
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      kept[j] = true
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++
    else j++
  }
  // Only words are marked; a space or comma between two changed words joins them into one mark.
  const changed = b.map((t, j) => isWord(t) && !kept[j])
  return b.map((t, j) => ({ text: t, changed: changed[j] || (!isWord(t) && changed[j - 1] && changed[j + 1]) }))
}

function merge(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  for (const p of pieces) {
    const last = out[out.length - 1]
    if (last && Boolean(last.changed) === Boolean(p.changed)) last.text += p.text
    else out.push({ ...p })
  }
  return out
}

/** Every change, hint and frame of the review, gathered across sentences. Frames are listed once each. */
export function reviewNotes(review: Review) {
  const frames = new Map<string, ReviewFrame>()
  for (const s of review.sentences) for (const f of s.frames) frames.set(f.id, f)
  return {
    changes: review.sentences.flatMap((s) => s.changes),
    hints: review.sentences.flatMap((s) => s.hints),
    frames: [...frames.values()],
    unchecked: review.sentences.flatMap((s) => s.unchecked),
  }
}
