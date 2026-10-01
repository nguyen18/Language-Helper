import { callFunction } from './backend'
import type { TargetLanguage } from './languages'

// Grammar checking for diary entries, by the backend's `check-grammar` function
// (supabase/functions/check-grammar), which runs which-dialect's checker. The checker only speaks up when
// it's confident, so no issues means nothing was found, not that the text is certainly right.

// which-dialect's CheckIssue.
export type GrammarIssue = {
  rule: string
  /** 'error': not a word of the language; 'warning': wrong for the region or relationship; 'suggestion': often better. */
  severity: 'error' | 'warning' | 'suggestion'
  /** Offsets into GrammarCheck.text. */
  start: number
  end: number
  text: string
  message: string
  /** Replacements for `text`, best first. */
  suggestions: string[]
}

export type GrammarCheck = {
  /** The text that was sent, to tell whether the entry changed since. */
  input: string
  /** The input in Unicode NFC form, which the issues' offsets refer to. */
  text: string
  issues: GrammarIssue[]
  checkedAt: string
}

export async function checkGrammar(target: TargetLanguage, input: string): Promise<GrammarCheck> {
  const { text, issues } = await callFunction<{ text: string; issues: GrammarIssue[] }>(
    'check-grammar',
    { target: target.id, text: input },
    'Checking the grammar failed',
  )
  return { input, text, issues, checkedAt: new Date().toISOString() }
}

/** A run of the corrected text: unchanged, or a replacement made for an issue. */
export type Piece = { text: string; fix?: { from: string; issue: GrammarIssue } }

// Errors and warnings are corrected with their best suggestion; 'suggestion' issues are left as tips.
const isCorrection = (i: GrammarIssue) => i.severity !== 'suggestion' && i.suggestions.length > 0
const SEVERITY_ORDER = { error: 0, warning: 1, suggestion: 2 }

/** The entry with every correction applied, in pieces so the changed words can be marked. */
export function correctedPieces(check: GrammarCheck): Piece[] {
  // When two issues overlap, the earlier one wins, and the more severe one at the same place.
  const fixes = check.issues
    .filter(isCorrection)
    .sort((a, b) => a.start - b.start || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  const pieces: Piece[] = []
  let at = 0
  for (const issue of fixes) {
    if (issue.start < at) continue
    if (issue.start > at) pieces.push({ text: check.text.slice(at, issue.start) })
    pieces.push({ text: keepCapital(issue.text, issue.suggestions[0]), fix: { from: issue.text, issue } })
    at = issue.end
  }
  if (at < check.text.length) pieces.push({ text: check.text.slice(at) })
  return pieces
}

/** Issues that weren't applied as corrections: worth a look, but often fine. */
export function grammarTips(check: GrammarCheck): GrammarIssue[] {
  return check.issues.filter((i) => !isCorrection(i))
}

// "Khong" → "Không", not "không": a replacement keeps the capital of the word it replaces.
function keepCapital(original: string, replacement: string): string {
  const first = original.charAt(0)
  if (first && first !== first.toLowerCase() && replacement.charAt(0) === replacement.charAt(0).toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}
