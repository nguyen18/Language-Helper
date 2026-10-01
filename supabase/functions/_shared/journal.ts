// Shared by the journal's functions (check-spelling, sentence-frames): the languages the site offers and
// where which-dialect's data lives in Storage.

// Languages the site offers (TARGET_LANGUAGES in web/src/lib/languages.ts).
export const TARGETS: Record<string, { code: string; region?: string }> = {
  'vi-Southern': { code: 'vi', region: 'Southern' },
  'vi-Central': { code: 'vi', region: 'Central' },
  'vi-Northern': { code: 'vi', region: 'Northern' },
}

// Storage folders per language (web/scripts/mirror-data.ts's DATA_SETS). The journal functions import
// which-dialect 0.4.0 (see their deno.json), whose review and frames need vi 0.1.4's data; English (for
// English words in an entry) didn't change, so it's shared with `translate`. Bump together.
const VERSION = '0.4.0'
const STORAGE = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/which-dialect`
const SHARED: Record<string, string> = { en: '0.1.1/en' }
export const dataUrl = (lang: string) => `${STORAGE}/${SHARED[lang] ?? `${VERSION}/${lang}`}`

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Serves a handler with CORS headers on every reply, including the preflight. */
export function withCors(handler: (req: Request) => Promise<Response>) {
  return {
    async fetch(req: Request) {
      if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
      const res = await handler(req)
      const headers = new Headers(res.headers)
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
      return new Response(res.body, { status: res.status, headers })
    },
  }
}
