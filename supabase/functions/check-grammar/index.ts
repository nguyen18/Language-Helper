// Checks a diary entry's grammar with which-dialect's checker: POST { target, text } returns
// { text, issues } (which-dialect's CheckResult: `text` is the input in Unicode NFC form, which the
// issues' offsets refer to). The web app turns the issues into a corrected copy (web/src/lib/grammar.ts).
// which-dialect's data is read from this project's Storage, like the `translate` function's (see
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

// Storage folders per language (mirror-data.ts's DATA_SETS): the checker came with which-dialect 0.2.0
// and needs vi 0.1.2's data; English, used to suggest regional words, didn't change, so it's shared with
// `translate`. Bump with the which-dialect import in deno.json.
const STORAGE = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/which-dialect`
const DATA: Record<string, string> = { en: '0.1.1/en', vi: '0.2.0/vi' }
// Kept between requests while the function stays warm, so data files already loaded are reused.
const checker = wd.createChecker({ baseUrl: (lang) => `${STORAGE}/${DATA[lang] ?? `0.2.0/${lang}`}` })

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
  // A diary has no listener: pronouns are only checked against each other, and no polite endings.
  const result = await checker.check(text, { lang: target.code, region: target.region })
  return Response.json(result)
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
