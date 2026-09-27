# Language Helper — Architecture & Context

Deep-dive reference for future sessions/agents working on this repo. Read this before making changes so you don't have to re-derive context from scratch. Product ideas and planning live in `NOTES.md`; this doc covers the code and the reasoning behind it.

## What this project is

A language-learning app that teaches a new language by building on how the person already expresses themselves in their primary language. Instead of textbook vocabulary, the app finds the words and phrases the user actually uses (fillers, reactions, linking words, the way they show feelings) and teaches natural equivalents of *those* in the target language.

The long-term plan (see `NOTES.md`) is a personal phrasebook, a feelings map, practice using the user's own stories, flashcards and a coverage score, all built from one shared **phrase entry** data structure.

**What exists today is a proof of concept for one piece only, the Personal Word List Discoverer** (the owner's name for it, 2026-09-27; use this name when referring to the feature): the user has a casual chat with a scripted friend ("Mai", called "Sam" until 2026-09-26), and the app shows the user's top 100 most-used words. Since 2026-09-27 it lives on its own page, reached from a home page that shows Mai's study plan (a to-do list) and a site menu. A **Cheatsheet** page (2026-09-27) shows reference word lists, starting with the 100 most common words. Everything runs client-side: no backend, no accounts, no Claude calls yet. Replies never leave the device, except that dictation audio goes to the browser vendor's speech service (see "Dictation" below).

## Current state (as of 2026-09-27)

- `NOTES.md` — planning notes: decisions, cost notes, the full feature/toolkit list, version priorities, and a "Proof of concept" section describing what's built.
- `ARCHITECTURE.md` — this file.
- `web/` — the POC app. React 19 + Vite 8 + TypeScript, scaffolded from Vite's `react-ts` template, linted with oxlint.
  - `src/main.tsx` — template entry point, renders `<App />` in `StrictMode`.
  - `src/App.tsx` — the app shell: picks the page from the route and renders the site header with the menu (`SiteHeader`).
  - `src/pages/Home.tsx` — the home page: Mai's greeting, Mai's study plan (checkable to-dos) and a card linking to the Discoverer.
  - `src/pages/Cheatsheet.tsx` — the Cheatsheet page: one card per list in `CHEATSHEET_LISTS`.
  - `src/pages/Discoverer.tsx` — the Personal Word List Discoverer: the chat screen (`Discoverer`) and the top-100 screen (`Results`).
  - `src/lib/useRoute.ts` — tiny hash router: the `Route` type, `ROUTE_HREF` and the `useRoute` hook.
  - `src/lib/cheatsheet.ts` — the Cheatsheet's word lists (`CHEATSHEET_LISTS`).
  - `src/lib/studyPlan.ts` — Mai's study plan items (`STUDY_PLAN`).
  - `src/lib/conversation.ts` — Mai's script (`MAI_SCRIPT`) and `QUESTION_COUNT`.
  - `src/lib/wordCounts.ts` — splitting text into words, counting, the fallback word list, and display casing.
  - `src/lib/useDictation.ts` — React hook wrapping the browser's Web Speech API.
  - `src/index.css` — color tokens (light mode only) and base styles.
  - `src/App.css` — all component styling.
  - `public/favicon.svg`, `README.md`, `.oxlintrc.json`, `tsconfig*.json`, `vite.config.ts` — unchanged from the Vite template.
- Only runtime dependencies are `react` and `react-dom`. Build output is ~70 KB gzipped.
- Git: `main` on GitHub at `nguyen18/Language-Helper` (first commit 2026-09-27). No deployment, no tests.

Run it: `cd web && npm install && npm run dev`. Checks: `npm run build` (type-checks via `tsc -b`, then bundles) and `npm run lint`.

### Planned stack (not yet in the code)
From `NOTES.md`, TypeScript everywhere: React + Vite web app, wrapped with **Capacitor** for iOS/Android, **Supabase** (Postgres + auth) with serverless functions for the backend, and the **Anthropic TypeScript SDK** called from those functions (never from the client, to keep the API key server-side). Rust is explicitly out for v1. Apple guideline 4.2 can reject thin web wrappers, so native touches (notifications, haptics, widget) are planned. The POC is deliberately just the React + Vite part so it can grow into this without a rewrite.

## Architecture of `web/`

### Pages and routing (`App.tsx`, `lib/useRoute.ts`)
Three pages, chosen by the URL hash so refresh and the browser's Back button work without a router library or server config:

| Route | Hash | Page |
|---|---|---|
| `home` | `#/` (or no hash, or anything unknown) | `Home` |
| `discover` | `#/discover` | `Discoverer` |
| `cheatsheet` | `#/cheatsheet` | `Cheatsheet` |

`useRoute` reads `window.location.hash` and listens for `hashchange`; navigation is plain `<a href={ROUTE_HREF[...]}>` links. To add a page: add it to `Route` and `ROUTE_HREF` (`readRoute` looks the hash up in `ROUTE_HREF`), then to the switch in `App` and to `MENU_ITEMS`. If routes start needing parameters or nesting, that's the point to switch to a real router.

**Scroll:** `App` scrolls to the top when entering any page except the Discoverer. It deliberately doesn't for the Discoverer, whose own effect scrolls to the latest message (child effects run before the parent's, so a parent scroll-to-top would override it).

**Site header** (`SiteHeader` in `App.tsx`): a "✦ Language Helper ✦" brand link to home (styled after the Try Studio wordmark) and a **☰ Menu** button that opens a dropdown `<nav>` with links to each page (current page marked `aria-current="page"`) plus a greyed-out "Coming soon" list (Personal phrasebook, Feelings map, Flashcards, from `NOTES.md`). The menu closes on Escape, a click outside, or clicking a link. `SiteHeader` is rendered with `key={route}` so it remounts closed on every page change, including Back; this replaced a `setOpen(false)` effect that oxlint's `set-state-in-effect` rule flagged.

### Home page (`pages/Home.tsx`, `lib/studyPlan.ts`)
- Greeting from Mai ("Hi, I'm Mai!").
- **Mai's study plan**: `STUDY_PLAN` items, each with a bold task, a one-line explanation and an optional link to a page. Checked ids are saved in `localStorage` under `language-helper:study-plan` (same try/catch pattern as the chat). A counter shows "N of 5 done"; done items are struck through. The wording is placeholder copy written 2026-09-27, the owner may rewrite it. **Keep ids stable** when editing text, or saved checkmarks are lost.
- A blush-colored **Personal Word List Discoverer** card and a plain **Cheatsheet** card, each with an Open button.
- Checkboxes are real `<input type="checkbox">` with `<label htmlFor>`, so the task text is clickable and screen readers work.

### Cheatsheet page (`pages/Cheatsheet.tsx`, `lib/cheatsheet.ts`)
`CHEATSHEET_LISTS` is an array of `{ id, title, description, translationLang?, entries }`, where each entry is `{ word, translation? }`. The page renders one card per list, so **adding a list is a data-only change** in `cheatsheet.ts`. Each list is a native `<details open>` card (`.cheat-list`): clicking the title row (`<summary>`: title, word count, an SVG chevron that points right when collapsed) collapses it to just that row (owner's request 2026-09-27). Lists start expanded on every visit; the open/closed state isn't saved. Using `<details>` gives keyboard (Enter/Space) and screen reader support for free; the default disclosure triangle is hidden in CSS. Entries show as a numbered responsive grid (`.cheat-grid`, `auto-fill` columns of at least 190px), read left to right in rank order: rank, English word (indigo, bold), and the translation right-aligned in **vintage cherry red** (`--cherry: #9b1b30`, owner's request 2026-09-27). Translation spans get `lang={translationLang.code}` for screen readers, and a small legend ("English · Southern Vietnamese") explains the two colors. Words are React keys, so each list's words must be unique.

**Translations (2026-09-27):** the top-100 list has casual **Southern Vietnamese** equivalents, written by the agent at the owner's request: Southern forms like *tui* (I), *hông* (not), *thiệt* (really), *ừa* (yeah), *cổ*/*ảnh* (she/him), *chờ* (wait), *giờ* (now), *cám ơn* (thanks). One common equivalent per word; English grammar words often have no direct match ("the" → "—", "is" → "là", "its" → "nó là"), so these are approximations and **haven't been reviewed by a native speaker**.

The first list, **100 most common words**, is the owner's ranked list from `~/dev/top_100_words.txt` (outside the repo). **Keep its order and spellings exactly as given**: it uses texting spellings without apostrophes ("im", "dont", "thats", "tho", "gonna"). It's a different list from `FALLBACK_WORDS` in `wordCounts.ts`; the owner chose this one for the Cheatsheet on 2026-09-27.

### Discoverer screens and state (`pages/Discoverer.tsx`)
Two views inside the page, switched by a `view` state (`'chat' | 'results'`). Both show a "Personal Word List Discoverer" eyebrow above the heading. The view isn't in the URL, so leaving the page and coming back always opens the chat (with the conversation intact).

**App state** is a single `SavedState` object:

| Field | Meaning |
|---|---|
| `replies: string[]` | The user's sent replies. `replies[i]` answers `MAI_SCRIPT[i]`. |
| `draft: string` | The current unsent text in the reply box. |

It's loaded from and saved to `localStorage` under the key `language-helper:chat` on every change, so a refresh doesn't lose the conversation. Both reads and writes are wrapped in `try/catch`; storage is a convenience and the app works without it. **Start over** confirms with `window.confirm`, then resets to `EMPTY_STATE`.

**Chat screen** (`Discoverer`):
- Renders `MAI_SCRIPT.slice(0, replies.length + 1)`: every Mai line already answered, plus the next line waiting for an answer. Each line is a `.turn` containing Mai's bubble and, if present, the user's reply bubble.
- There is no separate message list. The conversation is fully derived from `replies.length` and the script, which is why Mai's lines can't depend on what the user said.
- `finished` is `replies.length >= QUESTION_COUNT`. When true, the reply box is replaced by a **See my top 100 words** button. Mai's final line (the goodbye) is shown but never answered.
- Reply box: `<textarea>` with `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}` so slang and fillers aren't "fixed". Enter sends, Shift+Enter adds a newline, and `isComposing` is checked so Enter during IME composition (e.g. typing Japanese) doesn't send.
- **+ um / + uh chips** (`insertFiller`) insert `"um, "` / `"uh, "` at the cursor (replacing any selection), adding a leading space if needed, then restore focus and cursor position on the next animation frame.
- **End chat and see my top 100 words** link appears once there's at least one reply, so users can stop early.
- Auto-scrolls to the bottom (`bottomRef`) whenever a reply is added or the view changes.

**Results screen** (`Results`):
- `topWords(replies, 100)` produces the list. Also shows reply count and total words (via `tokenize`).
- Real words show a bar scaled to the top count. Suggested (fallback) words are greyed out with a "suggested" label and no count.
- If any fallback words were used, a line explains how many came from the user's replies.

### Mai's script (`conversation.ts`)
`MAI_SCRIPT` is a fixed array of 14 lines. The first 13 each expect a reply; the last is a goodbye (`QUESTION_COUNT = MAI_SCRIPT.length - 1`). The lines cover the same ground as the original prompt list: the week, something annoying, something exciting, a recommendation, a funny/embarrassing story, and stress. Each Mai line opens with a generic reaction ("Ugh, I'd be annoyed too", "No way!") so it fits whatever the user said, then asks an open question that invites storytelling, which is where fillers and reactions show up.

Editing the script is safe: the UI and counts derive from its length. Keep the last line a closing line with no question, or change the `QUESTION_COUNT` logic.

### Word counting (`wordCounts.ts`)
- `tokenize(text)` — converts curly apostrophes (`‘ ’`) to `'`, lowercases, then matches `/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu`: runs of letters/digits, with inner apostrophes allowed so "don't" and "I'm" stay single words. Unicode-aware, so accented letters work. Hyphenated words split ("kinda-sorta" → two words), and numbers count as words.
- `topWords(texts, limit = 100)` — counts every token across all replies (**every word counts**: nouns, fillers and common words included), sorts by count descending then alphabetically, and takes the first `limit`. If that's fewer than `limit`, it tops up from `FALLBACK_WORDS` in list order, skipping any word already present, marking these `suggested: true` with `count: 0`.
- `FALLBACK_WORDS` — a fixed list of 100 everyday words **supplied by the project owner**. Keep it exactly as given (order and contents), including its few nouns (Person, Friend, Time, …); changes to it should come from the owner. It's also recorded verbatim in `NOTES.md`.
- `displayWord(word)` — words are stored lowercase; this capitalizes "i" and "i'm"/"i've"/etc. for display.

### Dictation (`useDictation.ts`)
The notes originally planned to rely on the phone keyboard's built-in dictation (no in-app button). Desktop browsers don't have that, so a **🎤 Dictate** button was added using the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).

- Supported in Chrome, Edge and Safari; not Firefox. `dictationSupported` is checked once at load; unsupported browsers see a note suggesting another browser or OS dictation (on a Mac, press Fn twice).
- Minimal Web Speech API types are declared in the file because not every TypeScript `lib.dom` includes them.
- Settings: `continuous = true`, `interimResults = true`, `lang = navigator.language`.
- In-progress speech is exposed as `interim` (shown in grey italics above the reply box). Each finished phrase is passed to `onFinal`, which the app **appends to the end of the draft**, not at the cursor.
- `onFinal` is kept in a ref updated in an effect (not during render; oxlint's `react(refs)` rule flags that).
- Errors: `not-allowed` → "Microphone access was blocked."; `no-speech` and `aborted` are ignored; others are shown.
- Dictation stops when the user sends a reply, when the view changes, and on unmount, so speech never lands somewhere unexpected.
- **Privacy caveat:** Chrome sends the audio to Google's servers for recognition (free, but not on-device). Safari uses Apple's service.
- Browser recognition, like keyboard dictation, usually drops "um"/"uh", which is why the filler chips remain.

### Styling
`index.css` defines color tokens on `:root` (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--accent-soft`, `--on-accent`, `--blush`, `--danger`) and sets `color-scheme: light`. The app is **light mode only** for now (owner's call, 2026-09-26): it ignores the OS dark-mode setting, and the earlier dark-mode overrides were removed. The palette (2026-09-26) follows the owner's Try Studio screenshot: warm off-white background (`#fdfbf7`), indigo ink for text and accents (`#23256e` / `#2e3192`), and blush pink (`#f7dde2`) for Mai's bubbles. The owner keeps screenshots in `~/Documents/Screenshots`. Font is the system UI stack (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`): San Francisco on Apple devices, no web fonts loaded. `App.css` holds all component styles: the site header and dropdown menu, cards and the to-do list on Home, chat bubbles (Mai left on `--blush`, user right on `--accent`), a sticky composer at the bottom, and the results list as a CSS grid (rank / word / bar / count). Max content width is 680px with 16px side padding.

## Known issues / dead code (as of 2026-09-26)

- The old prompt-based version saved state under `language-helper:poc` in `localStorage`. Nothing reads it now, so it just sits in the browsers of anyone who used that version.
- `web/README.md` is still the Vite template's boilerplate.
- Dictated text is appended to the end of the draft, while filler chips insert at the cursor. That's inconsistent if the user moves the cursor before dictating.
- Sent replies can't be edited or deleted; the only option is Start over.
- No tests. The word counting in `wordCounts.ts` is the most test-worthy logic if tests are added.
- Browser-tested by an agent (2026-09-27, Chrome): home page, menu, the Cheatsheet page, checking a to-do (persists after navigating), opening the Discoverer, and Back. Sending replies, dictation and the results screen haven't been click-tested by an agent.

## Considered but not built

- **Standalone prompt list** (2026-09-26): the first POC showed 20 prompts one at a time in random order, grouped by emotion/situation (Everyday, Annoyance, Excitement, Opinions, Storytelling, Social, Stress). Replaced by the Mai conversation at the owner's request because a conversation feels more natural. The Mai script covers the same topics.
- **Excluding nouns from the top 100** (2026-09-26): built with the `compromise` library (rule-based English part-of-speech tagging that runs in the browser; it correctly tagged "work" as a noun in "work was fine" and a verb in "I work too much"). Reverted the same day when the owner decided nouns should be included. `compromise` was uninstalled: it added ~140 KB gzipped and nothing else used it. It could come back for grouping word forms ("want"/"wanted") or finding phrases ("you know", "I mean"). It's **English-only**, which matters if users' primary language isn't English.
- **Hiding very common words** ("the", "a", "is") behind a toggle: offered, but the owner chose to show everything, since common words like "like", "so" and "really" are exactly what the app wants to catch.
- **AI-written Mai replies**: Mai reacting to what the user actually said, via Claude. Deferred to keep the POC free and backend-free. This is the natural next step for making the chat feel real (and matches `NOTES.md`'s "AI follow-up questions").
- **Custom font**: the owner shared a screenshot of another site (Try Studio) whose soft serif looked like Fraunces or Recoleta; switching the app to Fraunces was offered but not requested.

## If this grows

- **Phrases, not just words**: the product is built around phrases (`NOTES.md`'s phrase entry: phrase → purpose → feeling → equivalents by formality → examples). Counting two- and three-word phrases ("you know", "I mean") is the obvious next step from word counts, and designing the phrase entry data model is an open to-do.
- **Backend**: when replies need to reach Claude (for Mai's replies, tagging purpose/emotion, or target-language equivalents), add Supabase serverless functions as planned rather than calling the API from the browser. Cache equivalents per phrase, and use the Batch API (50% off) where results don't need to be instant.
- **Routing**: the hash router in `useRoute.ts` is fine for a handful of flat pages. Switch to a real router when routes need parameters or nesting.
- **Mobile**: before wrapping in Capacitor, test dictation there. The Web Speech API behaves differently in iOS WebViews, and the original plan (keyboard dictation, no button) may be the better path on phones.

## Working conventions for this repo

- TypeScript everywhere, per the planned stack.
- **Record product decisions in `NOTES.md`** (the owner asks for this) and code-level details here. When a decision is reversed, say so in both, rather than silently deleting the old one.
- Every word counts in the top 100. Don't add filtering (nouns, stopwords) without the owner asking.
- Keep `FALLBACK_WORDS` and the Cheatsheet's top-100 list exactly as the owner supplied them.
- Keep the POC client-side only until there's a concrete need for a backend.
- Before finishing a change: `npm run build` and `npm run lint` in `web/`, both clean.
- Test dictation changes in a real browser (Chrome and Safari at minimum); it can't be verified from builds alone.
