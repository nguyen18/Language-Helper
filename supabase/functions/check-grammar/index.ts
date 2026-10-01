// Reviews a journal entry with which-dialect's journal review: POST { target, text, checks? } returns its
// Review ({ text, corrected, sentences }). By default the review is a spellchecker: English words get the
// target-language word for the region (or are left out, like "the"), words missing their accents get them,
// and whole English sentences or clauses that follow a sentence frame get the frame's wording. `checks`
// turns on the extra checks the journal offers: other regions' words (`dialect`) and keeping one word for
// "I" (`pronoun-consistency`). Each sentence lists its changes with a reason, hints, the frames it follows,
// and English words with no translation. which-dialect's data is read from this project's Storage (see
// ../_shared/journal.ts).
//
// Each change also gets `options`: every word the checker suggested, best first (the review keeps only the
// first), so the learner can pick another one ("khong" → không, khổng, khống; "market" → chợ, …).
//
// Called from the browser with the publishable key (web/src/lib/grammar.ts).

import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import * as wd from 'which-dialect'
import { dataUrl, TARGETS, withCors } from '../_shared/journal.ts'

const MAX_LENGTH = 5000
// The opt-in checks the journal's setting can turn on; others stay off (a journal has no listener).
const OPTIONAL_CHECKS = ['dialect', 'pronoun-consistency'] as const

// Kept between requests while the function stays warm, so data files already loaded are reused.
const reviewer = wd.createReviewer({ baseUrl: dataUrl })
const checker = wd.createChecker({ baseUrl: dataUrl })

const handler = withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
  const body = await req.json().catch(() => null)
  const target = TARGETS[body?.target]
  const text: unknown = body?.text
  if (!target || typeof text !== 'string' || !text.trim() || text.length > MAX_LENGTH) {
    return Response.json(
      { error: `Send { target: one of ${Object.keys(TARGETS).join(', ')}, text: 1–${MAX_LENGTH} characters, checks? }` },
      { status: 400 },
    )
  }
  const checks = Object.fromEntries(OPTIONAL_CHECKS.map((rule) => [rule, body?.checks?.[rule] === true]))
  // No listener: people written about (má, thầy) aren't the person spoken to. English is the learner's language.
  const options = { lang: target.code, region: target.region, base: 'en' }
  const [review, checked] = await Promise.all([
    reviewer.review(text, { ...options, checks }),
    checker.check(text, { ...options, rules: { spelling: true, 'foreign-word': true, ...checks } }),
  ])
  // A change's options are the suggestions of the checker issue with the same rule and words, taken in
  // order so a word written twice matches each issue once. Frame changes have none.
  const unused = [...checked.issues]
  for (const sentence of review.sentences) {
    for (const change of sentence.changes as (wd.ReviewChange & { options?: string[] })[]) {
      const at = unused.findIndex((i) => i.rule === change.kind && i.text === change.from)
      if (at < 0) continue
      const [issue] = unused.splice(at, 1)
      if (issue.suggestions.length > 1) change.options = issue.suggestions
    }
  }
  return Response.json(review)
})

export default withCors(handler)
