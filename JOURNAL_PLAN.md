# Diary / journal: corrections and sentence frames (plan)

How the diary's review could look, and how which-dialect does the work. Written 2026-10-01 alongside
which-dialect's journal review (`createReviewer`), spellchecker (`createChecker`) and sentence frames
(`createPhrasebook`); updated the same day for which-dialect 0.4.0, where the checker became a
spellchecker by default. **No LLM** (owner's decision, 2026-10-01): everything below is rule-based, from
which-dialect's data.

## What the learner does

They write an entry in Vietnamese (the target language), in English, or a mix of both when they only have
broken Vietnamese ("Hôm nay tôi đi market với má"). Under the entry they get the corrected version in
Vietnamese, sentence by sentence: **every word corrected** (accents added, English words replaced by the
Vietnamese word for their region), with a short reason for each change, and sentence frames they can reuse.

## What the learner sees

```
Hôm nay tôi đi market với má. Toi muon an the ice cream but it was expensive. Ngày mai tui đi lại khong?
──────────────────────────────────────────────────────────────────
✓ Hôm nay tôi đi chợ với má.
    market → chợ (English word)
✓ Tôi muốn ăn kem nhưng mắc quá.
    Toi → Tôi · muon → muốn · an → ăn (missing accents)
    the → left out (Vietnamese has no "the") · ice cream → kem (English word)
    “but it was expensive” → “nhưng mắc quá” (sentence frame “but it was {quality}”)
✓ Ngày mai tui đi lại không?
    khong → không (missing accents)
💡 Frames for this entry: “Hôm nay tôi {action}.”, “Tôi muốn {action}.”, “nhưng {quality} quá”
```

That's which-dialect's output for that entry with region Southern, apart from the wording of the short
reasons, which the app can shorten from each change's `kind` and `why`. By default the review is a
spellchecker: Southern *tui* stays, and so would Northern *lợn* in Southern text. Turning on the extra
checks (`checks: { dialect: true, 'pronoun-consistency': true }`) adds *lợn* → *heo* and *tui* → *tôi*
("you used tôi earlier"); a settings toggle could offer them.

UI pieces:
- **The entry stays as written.** The corrected version goes underneath, one line per sentence, so the
  learner compares their sentence with the fix.
- **Changed words are highlighted** in the corrected line; tapping one shows the reason (`why`). Different
  colors per kind help: English word translated (`foreign-word`), missing accents (`spelling`), sentence
  frame (`frame`), and, when turned on, another region's word or a pronoun.
- **Hints** (`hints`: not applied, e.g. "end with ạ when talking to your parents") as quieter tips under
  the sentence, which the learner can accept.
- **Couldn't correct** (`unchecked`): English words with no Vietnamese translation are left as written and
  shown honestly.
- **Frames panel** ("💡 Frames for this entry", from each sentence's `frames`): the frame's pattern for the
  learner's region ("{place} ở mô?" in Central) and its English. Tapping one could insert the pattern into
  the entry with the slot selected. A "browse frames" view by topic (journal, feelings, questions,
  requests, greetings) uses `phrasebook.frames({ lang, region, topic })`. Frames suggest; they don't change
  the learner's sentence.
- **Region** comes from the target language setting (vi-Southern, vi-Central, vi-Northern): translations
  use the region's words (*expensive* → Southern *mắc*, Northern *đắt*). A diary has no listener: people
  written about (*má*, *thầy*) aren't treated as who you're talking to.

## How which-dialect does it

`createReviewer().review(entry, { lang: 'vi', base: 'en', region, checks? })` returns
`{ text, corrected, sentences }`. Each sentence has `original`, `parts` (the sentence split by language),
`corrected`, `changes` (`{ from, to, why, kind }`; `to` is `''` when a word is left out), `hints`, `frames`
(`{ id, en, text }`) and `unchecked`. Per sentence:

1. Each word is marked Vietnamese or English from the two dictionaries (Vietnamese typed without accents,
   like "khong", still counts as Vietnamese; "but" stays English, not *bút*).
2. A whole English sentence or clause that follows a sentence frame gets the frame's natural wording ("but
   it was expensive" → "nhưng mắc quá"; "Where is the bathroom?" → "Phòng tắm ở đâu?").
3. The spellchecker runs on the whole entry: every remaining English word gets its Vietnamese word
   ("market" → "chợ"; "the" left out), and every misspelled or accent-less word its accents ("khong" →
   "không", "toi" → "tôi"). Opt-in `checks` add regional words, pronouns, consistency and polite endings.
4. The sentence frames each corrected sentence follows are listed.

Sentence frames come from `createPhrasebook()`: `frames()` to list them for a region, `render(id, { slots })`
to fill one, `match(english)` for an English sentence. 34 frames so far; more are planned (which-dialect's
FUTURE_IMPROVEMENTS.md).

## Fitting it into the current diary code

The diary page in progress (branch `diary`: `DiarySheet.tsx`, `lib/diary.ts`, `lib/grammar.ts`, and the
`check-grammar` Supabase function) runs which-dialect's checker on an entry and applies errors and warnings,
with suggestions as tips. Moving to the review:

- **Backend:** in `check-grammar` (or a new `review-entry` function), call
  `createReviewer({ baseUrl }).review(text, { lang, base: 'en', region })` instead of `checker.check(...)`,
  and return the review. It needs which-dialect **0.4.0** and Vietnamese data **0.1.4**; English data is
  unchanged (0.1.1). Update the Storage folders in `mirror-data.ts` and the `DATA` map in the function when
  they're published.
- **Note for the checker as it's used today:** from 0.4.0, `checker.check(text, { lang, region })` runs
  only the spellchecker (spelling and English words) unless `rules` turns on more; with 0.2.0/0.3.0 every
  check ran.
- **Saved check:** store the review on the entry (like `check` today), stale when the text changes.
- **Corrected text:** `review.corrected` replaces `correctedPieces()`; the highlighted pieces come from each
  sentence's `changes` (the corrected sentence plus `from`/`to`), so the client doesn't re-apply fixes.
- **What can't be fixed:** corrections are word by word, except for sentences a frame covers, so word order
  and grammar aren't fixed ("I am very happy" → "Tôi là rất mừng"; "it was very expensive" → "nó là rất
  mắc"). Accent-less words that are also common words (*ma*, *me*) are only fixed in text typed without
  accents.
