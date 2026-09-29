# Language Helper — Planning Notes

Running notes for ideas and planning before (and during) the build.

---

## Decisions so far

- **Input method:** Guided questions / conversational prompts. Users answer in a text box that supports native keyboard dictation (speak or type), then edit before submitting.
  - Autocorrect/spellcheck off in the answer box to preserve slang.
  - Native dictation usually keeps lexical fillers ("like", "you know", "I mean") but drops hesitation sounds ("um", "uh") → offer quick-insert chips for "um"/"uh".
  - Optional "I spoke this" toggle (app can't detect keyboard dictation on its own).
  - Scenario prompts (e.g. "tell me about something that annoyed you") give the intended emotion for free — the prompt labels the data.
  - AI follow-up questions to make it feel like a conversation.
- **Analysis approach (hybrid):** Deterministic stats (word/n-gram counts, collocations) find the top phrases; an LLM (Claude) tags function/emotion and generates target-language equivalents. Cache equivalents per phrase.
- **Stack:** TypeScript everywhere.
  - React + Vite (web app)
  - Capacitor (iOS/Android wrap)
  - Supabase (Postgres + auth) and serverless functions for the backend / Claude API calls
  - Anthropic TypeScript SDK for analysis
- **Rust:** Not for v1. Possible later for a specific heavy module (e.g. on-device processing via WASM).
- **App Store risk:** Apple guideline 4.2 can reject thin web wrappers — plan native touches (notifications, haptics, widget).

### Cost notes
- Native dictation: free.
- LLM analysis: well under $1/month per active user at typical usage (Sonnet-class model); batch API is 50% off.
- Fixed: Apple Developer $99/year, Google Play $25 one-time.

### Todo before coding
- [ ] Pick target language (affects register/regional emphasis)
- [ ] 5-minute dictation test on iPhone / Android / Mac with a filler-heavy script
- [ ] Draft question bank (~30–50 prompts grouped by emotion/situation)
- [ ] Design the phrase entry data model

Dictation test script:
> "So um, I was like, super tired, you know? And uh, basically I just, I mean, I kinda wanted to go home, but like, my friend was literally begging me to stay, so… yeah."

---

## Language Toolkit Ideas

Guiding idea: **teach a new language by building on how the person already expresses themselves in their primary language.**

### 1. Core: the personal phrasebook
- **Your top phrases, each with a natural equivalent.** For every phrase, show:
  - Your phrase and how often you use it
  - What you use it for (purpose) and the feeling behind it
  - 1–3 target-language equivalents, labeled casual, neutral or formal
  - A note on regional differences, e.g. Mexico vs. Spain
  - An example sentence, ideally built from something you actually said
  - The literal meaning, so you understand why the phrase works
- **Your hesitation sounds and filler words**, like "o sea", "este…" and "pues", which make you sound natural
- **Reactions and exclamations:** "no way!", "ugh", "oh nice", "that's crazy". People use these constantly, and textbooks barely cover them.
- **Linking words:** "anyway", "so basically", "the thing is…", "on the other hand". These are what let you tell a story instead of listing sentences.

### 2. The feelings map
- **Grouped by feeling rather than by phrase**, e.g. "How you show annoyance" with the target-language options
- **An intensity scale for each feeling**, from mildly annoyed to furious, and from "that's nice" to "that's AMAZING". It's a common gap for learners: they know one word per emotion.
- **Different phrasings for different listeners.** A friend, a coworker and a stranger each need a different version of the same feeling. This matters a lot in languages like Japanese or Korean.

### 3. Cultural safety notes
- **Phrases that don't translate directly.** Some English expressions have no real equivalent and need a different approach.
- **Warnings:** phrases that sound rude, outdated or overly formal, and slang that only works in certain regions
- **False friends:** words that look alike but mean something else, e.g. Spanish *"embarazada"* means pregnant, not embarrassed

### 4. Practice
- **Your own answer, translated.** Possibly the best feature. Take a story you told in English, show it in natural target-language form, then have you retell it yourself while the AI gently corrects you. You'd be learning from your own life.
- **Flashcards with spaced repetition**, built only from your phrases. The `ts-fsrs` library implements a proven spacing algorithm (FSRS).
- **Audio for every phrase**, using the browser's built-in text-to-speech. It's free.
- **Later:** a practice conversation with an AI that deliberately uses your phrases

### 5. Progress
- **A coverage score**, e.g. *"You can now say 62% of the phrases you use most."* Very motivating and specific to you.
- **Topic vocabulary:** words for the subjects you actually talk about, like your job, hobbies or family
- **Export to Anki or share a list**, so learners who already use other tools can bring their phrases along

### Suggested priorities

| Version | What's included |
|---|---|
| **v1** | Phrasebook, feelings map, filler/reaction/linking-word kit, audio |
| **v2** | Your answer translated, flashcards, coverage score |
| **v3** | Practice conversations, cultural notes, export |

**Planning note:** nearly everything above comes from a single **phrase entry** (phrase → purpose → feeling → equivalents by formality → examples). If that data structure is designed well now, most features become different views of the same data.

---

## Proof of concept (`web/`)

Scope: only the **Personal Word List Discoverer** (named 2026-09-27): the feature where the user chats with Mai and discovers their top 100 most-used words. It's the first step toward the personal phrasebook. Runs entirely in the browser (no backend, no Claude calls yet).

- **Conversation instead of prompts:** The user chats with **Mai** (renamed from Sam on 2026-09-26), a friend catching up with them, instead of answering a list of standalone prompts. Mai follows a fixed script (`web/src/lib/conversation.ts`) covering the same ground as the old prompts: the week, something annoying, something exciting, a recommendation, a funny/embarrassing story, and stress. Mai's reactions are generic so they fit any answer. Later, Claude could write Mai's replies so they respond to what the user actually said.
- **Home page (2026-09-27):** The app opens on a home page instead of straight into the chat. It has a menu (with planned features listed as "coming soon"), a greeting from Mai, **Mai's study plan** (a checkable to-do list of study steps, e.g. chat with Mai, review your top words, pick 5 to learn first, come back tomorrow), and a card that opens the Personal Word List Discoverer, which now lives on its own page. The study plan wording is a first draft; edit freely.
- **Cheatsheet page (2026-09-27):** A page of handy word lists, opened from the menu or a home page card. It starts with **100 most common words you use** (the owner's ranked list in `~/dev/top_100_words.txt`, same order; texting shorthand was later replaced with the dictionary word in the same place: im → I'm, ok → okay, thats → that's, dont → don't, ill → I'll, didnt → didn't, tho → though, gonna → going to, wanna → want to, kinda → kind of, its → it's). Contractions (I'm, that's, don't, I'll, didn't, it's) were briefly removed and replaced with as, he, by, an, his, has, then **put back** (2026-09-29): they're how people really talk and translate as units (don't → đừng), and splitting them would only have added "am". Idea for later: show a contraction's parts and combine their translations (I'll = I + will → tui sẽ). Translations are shown in a vivid red (`#c9221d`; tried vintage cherry, the owner's screenshot tomato red, and a deeper version first).
  - **First version (earlier on 2026-09-27, since replaced):** hand-written casual Southern Vietnamese translations (I → tui, not → hông, really → thiệt), example sentences, usage notes, alternatives to star (you: bạn / mày / anh·chị; yes: dạ / ừ; I: tui / tôi / mình / tao / em / anh·chị / con / cháu…), and an explanation for "the" (no Vietnamese article).
  - **Now: generated by which-dialect** (the owner's open-source translator, `~/dev/which-dialect`), at the owner's request to use the package for everything. Tapping (or hovering) an **English word** lists all of its meanings (part of speech, definition, example); the user stars the one they mean. The **translation follows the chosen meaning**, and its box lists that meaning's Southern Vietnamese options to star, with each option's definition, region and a Wiktionary example where available. Every meaning is shown (no cap). Picks are saved in the browser. Known weak spots: grammar words (*the*, *I'll*, *going to* have no translation) and some first picks are poor; the owner accepted this in exchange for a fully automatic list. Credit line required: "Meanings and translations from Wiktionary (CC BY-SA 4.0), via which-dialect."
  - On phones, tapping is the only way to open either box, and it appears as a card centered on screen that scrolls inside if long.
  - **Custom lists:** users can press "+ Add a new list" to make their own named lists and add English words with their translations (saved in the browser for now). Renaming, editing words, meanings/examples on custom words, and suggestions from which-dialect when adding a word are possible next steps.
- **Look:** Colors follow the Try Studio screenshot the owner shared: warm off-white, indigo blue and blush pink. Light mode only for now: the app ignores the phone/computer dark-mode setting (decided 2026-09-26; dark mode can come back later).
- **Input:** Type or dictate. A 🎤 Dictate button uses the browser's speech recognition (Chrome, Edge, Safari), and "+ um / + uh" chips add back fillers that dictation drops.
- **Every word counts:** The top 100 includes all words: nouns, fillers and common words. (We briefly tried excluding nouns with the `compromise` library, then decided to keep them. `compromise` could come back later for grouping word forms like "want"/"wanted" or finding phrases like "you know". It's English-only.)
- **Fallback word list:** If the user's replies have fewer than 100 distinct words, the list is topped up from a fixed set of common everyday words, skipping any the user already used. These are marked "suggested". The list (in `web/src/lib/wordCounts.ts`):
  > I, You, He, She, We, They, This, That, Who, What, Person, Man, Woman, Friend, People, Be, Have, Do, Make, Say, Tell, Get, Take, Go, Come, Know, See, Look, Think, Want, Give, Use, Find, Ask, Work, Seem, Feel, Try, Leave, Call, Eat, Drink, Sleep, Buy, Pay, Time, Year, Day, Week, Now, Then, Before, After, Today, Always, Never, Where, Here, There, Up, Down, In, Out, On, Off, Over, Under, Far, Near, Good, Bad, Big, Small, New, Old, Hot, Cold, Fast, Slow, Happy, Sad, Right, Wrong, More, Less, All, Some, Other, Same, Different, And, But, Or, Because, If, With, Without, For, From, About

---

## Planned: an open slang layer (not built yet)

Decided 2026-09-27: **build our own openly licensed slang dictionary** as part of which-dialect, rather than using an existing one. Not started; noted here for later.

- **Why:** no open slang dictionary covers English, Spanish and Vietnamese. Urban Dictionary (English only) and printed slang dictionaries (Green's Dictionary of Slang, Diccionario de americanismos, Vietnamese slang books) are copyrighted and can't go into an open-source package; Urban Dictionary is also unvetted. Wiktionary's slang labels are already in which-dialect, but coverage is uneven (as of 2026-09-27: English ~20,900 slang senses, Spanish ~970, Vietnamese only ~340, mostly texting shorthand like *a* = anh, *ae* = anh em).
- **Idea:** collect the slang people actually use (Language Helper's custom lists already gather users' own words), add a "suggest a word" flow, and publish the results as an openly licensed slang file in which-dialect, per language and region, in the same format as the dictionary data so translation picks it up automatically. Needs a review step, since slang submissions can be jokes or offensive.
- **Also worth doing:** contribute well-sourced slang back to Wiktionary (it flows into which-dialect on the next rebuild), and check community Vietnamese *teencode* lists or research datasets (e.g. ViLexNorm) for a clear open license (MIT/CC) to fill the texting-spelling gap. Licenses must be checked one by one before reusing anything.

## Open questions
- Which language is being learned first? (Changes how much weight formality levels and regional differences need.)
- Additional toolkit ideas to add and compare against the list above.
