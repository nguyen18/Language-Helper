# Diary / journal: corrections and sentence frames (plan)

How the diary's review could look, and how which-dialect does the work. Written 2026-10-01 alongside
which-dialect's sentence frames and journal review (`createReviewer`, `createPhrasebook`). **No LLM**
(owner's decision, 2026-10-01): everything below is rule-based, from which-dialect's data.

## What the learner does

They write an entry in Vietnamese, in English, or a mix of both when they only have broken Vietnamese
("Hôm nay tôi đi market với má"). Under the entry they get the corrected version, sentence by sentence,
with a short reason for each change, and sentence frames they can reuse.

## What the learner sees

```
Hôm nay tôi đi market với má. Tôi muốn ăn thịt lợn but it was expensive. Ngày mai tui đi lại khong?
──────────────────────────────────────────────────────────────────
✓ Hôm nay tôi đi chợ với má.
    market → chợ (English word)
✓ Tôi muốn ăn thịt heo nhưng mắc quá.
    lợn → heo (Southern)
    “but it was expensive” → “nhưng mắc quá” (sentence frame “but it was {quality}”)
✓ Ngày mai tôi đi lại không?
    khong → không (missing accents)
    tui → tôi (you used “tôi” earlier: keep one word for “I”)
💡 Frames for this entry: “Hôm nay tôi {action}.”, “Tôi muốn {action}.”, “… có … không?”
```

That's real output from which-dialect for that entry with region Southern, apart from the wording of the
short reasons, which the app can shorten from each change's `kind` and `why`.

UI pieces:
- **The entry stays as written.** The corrected version goes underneath, one line per sentence, so the
  learner compares their sentence with the fix.
- **Changed words are highlighted** in the corrected line; tapping one shows the reason (`why`). Different
  colors per kind help: English word translated, another region's word, missing accents, pronoun, frame.
- **Hints** (`hints`: not applied, e.g. "end with ạ when talking to your parents") as quieter tips under
  the sentence, which the learner can accept.
- **"Couldn't check"** (`unchecked`): English parts no frame covers ("The weather is nice today") are left
  as written and shown honestly, with nearby frames as a starting point. No guessing.
- **Frames panel** ("💡 Frames for this entry", from each sentence's `frames`): the frame's pattern for the
  learner's region ("{place} ở mô?" in Central) and its English. Tapping one could insert the pattern into
  the entry with the slot selected. A "browse frames" view by topic (journal, feelings, questions,
  requests, greetings) uses `phrasebook.frames({ lang, region, topic })`.
- **Region** comes from the target language setting (vi-Southern, vi-Central, vi-Northern). A diary has no
  listener: people written about (*má*, *thầy*) aren't treated as who you're talking to.

## How which-dialect does it

`createReviewer().review(entry, { lang: 'vi', base: 'en', region })` returns `{ text, corrected, sentences }`.
Each sentence has `original`, `parts` (the sentence split by language), `corrected`, `changes`
(`{ from, to, why, kind }`), `hints`, `frames` (`{ id, en, text }`) and `unchecked`. Per sentence:

1. Each word is marked Vietnamese or English from the two dictionaries (Vietnamese typed without accents,
   like "khong", still counts as Vietnamese; "but" stays English, not *bút*).
2. English parts become a filled sentence frame when one fits ("but it was expensive" → "nhưng mắc quá";
   "Where is the bathroom?" → "Phòng tắm ở đâu?"), else short phrases are translated in the region
   ("market" → "chợ"); longer English is listed as unchecked.
3. The grammar checker runs on the whole entry (so "tôi" here and "tui" there is caught), and its errors
   and warnings are applied; suggestions become hints.
4. Each corrected sentence is checked against sentence frames ("Bạn có đi chợ?" → "Bạn có đi chợ không?";
   "Toi khong biet" → "Tôi không biết").

Sentence frames come from `createPhrasebook()`: `frames()` to list them for a region, `render(id, { slots })`
to fill one, `match(english)` for an English sentence. 34 frames so far; more are planned (which-dialect's
FUTURE_IMPROVEMENTS.md).

## Fitting it into the current diary code

The diary page in progress (branch `diary`: `DiarySheet.tsx`, `lib/diary.ts`, `lib/grammar.ts`, and the
`check-grammar` Supabase function) already runs which-dialect's **checker** on an entry and applies errors
and warnings, with suggestions as tips. Moving to the review is a small step from there:

- **Backend:** in `check-grammar` (or a new `review-entry` function), call
  `createReviewer({ baseUrl }).review(text, { lang, base: 'en', region })` instead of `checker.check(...)`,
  and return the review. It needs which-dialect **0.3.0** and Vietnamese data **0.1.3** (adds
  `frames.json`); English data is unchanged (0.1.1). Update the Storage folders in `mirror-data.ts` and the
  `DATA` map in the function when they're published.
- **Saved check:** store the review on the entry (like `check` today), stale when the text changes.
- **Corrected text:** `review.corrected` replaces `correctedPieces()`; the highlighted pieces come from each
  sentence's `changes` (the corrected sentence plus `from`/`to`), so the client doesn't re-apply fixes.
- **What can't be fixed:** scrambled word order, missing verbs, or English with no frame stays as written
  and shows under "couldn't check". Accent-less words that are also real words (*toi*, *di*) are only
  fixed when a frame shows what they should be.
