// Checks a journal entry with which-dialect's journal review: POST { target, text } returns its Review
// ({ text, corrected, sentences }): the grammar checker runs on the whole entry and its errors and warnings
// are applied, then each sentence is checked against sentence frames (a missing "không", a frame word from
// another region), and English slipped into the entry is put into the target language where a frame or a
// short translation covers it. Each sentence lists its changes with a reason, hints, and the frames it
// follows. which-dialect's data is read from this project's Storage, like the `translate` function's (see
// web/scripts/mirror-data.ts).
//
// Called from the browser with the publishable key (web/src/lib/grammar.ts).

import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import * as wd from 'which-dialect'

// Languages the site offers (TARGET_LANGUAGES in web/src/lib/languages.ts).
const TARGETS: Record<string, { code: string; region?: string }> = {
  'vi-Southern': { code: 'vi', region: 'Southern' },
  'vi-Central': { code: 'vi', region: 'Central' },
  'vi-Northern': { code: 'vi', region: 'Northern' },
}
const MAX_LENGTH = 5000

// Storage folders per language (mirror-data.ts's DATA_SETS): sentence frames came with which-dialect 0.3.0
// and need vi 0.1.3's data; English (for regional words and English parts) didn't change, so it's shared
// with `translate`. Bump with the which-dialect import in deno.json.
const VERSION = '0.3.0'
const STORAGE = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/which-dialect`
const DATA: Record<string, string> = { en: '0.1.1/en' }
// Kept between requests while the function stays warm, so data files already loaded are reused.
const reviewer = wd.createReviewer({ baseUrl: (lang) => `${STORAGE}/${DATA[lang] ?? `${VERSION}/${lang}`}` })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const handler = withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
  const body = await req.json().catch(() => null)
  const target = TARGETS[body?.target]
  const text: unknown = body?.text
  if (!target || typeof text !== 'string' || !text.trim() || text.length > MAX_LENGTH) {
    return Response.json(
      { error: `Send { target: one of ${Object.keys(TARGETS).join(', ')}, text: 1–${MAX_LENGTH} characters }` },
      { status: 400 },
    )
  }
  // A journal has no listener: people written about (má, thầy) aren't the person spoken to, so pronouns are
  // only checked against each other and no polite endings are suggested. English is the learner's language.
  const review = await reviewer.review(text, { lang: target.code, region: target.region, base: 'en' })
  return Response.json(review)
})

export default {
  async fetch(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    const res = await handler(req)
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
    return new Response(res.body, { status: res.status, headers })
  },
}
