// The sentence frames for the journal's frames browser: POST { target, topic? } returns { frames }, each
// which-dialect's FilledFrame ({ id, topic, en, text, slots, … }) for the language's region, with content
// slots left open ("{place} ở đâu?"). Topics: journal, feelings, questions, requests, greetings.
//
// Called from the browser with the publishable key (web/src/lib/frames.ts).

import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import * as wd from 'which-dialect'
import { dataUrl, TARGETS, withCors } from '../_shared/journal.ts'

const phrasebook = wd.createPhrasebook({ baseUrl: dataUrl })

const handler = withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
  const body = await req.json().catch(() => null)
  const target = TARGETS[body?.target]
  if (!target || (body.topic !== undefined && typeof body.topic !== 'string')) {
    return Response.json({ error: `Send { target: one of ${Object.keys(TARGETS).join(', ')}, topic? }` }, { status: 400 })
  }
  const frames = await phrasebook.frames({ lang: target.code, region: target.region, topic: body.topic })
  return Response.json({ frames })
})

export default withCors(handler)
