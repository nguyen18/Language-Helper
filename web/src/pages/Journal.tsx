import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AudioNotePlayer } from '../components/AudioNoteRecorder'
import { JournalEditor } from '../components/JournalEditor'
import { JournalSheet } from '../components/JournalSheet'
import { backendConfigured } from '../lib/backend'
import { useJournal, useJournalExtraChecks, type JournalEntry } from '../lib/journal'
import { Popover } from '../components/Popover'
import {
  changeKey,
  keepCapital,
  keptWordKey,
  checkSpelling,
  kindOf,
  reviewNotes,
  sentencePieces,
  shownWord,
  wordTokens,
  withAcceptedHints,
  type SpellingCheck,
  type KeyedHint,
  type Piece,
  type WordOption,
  type ReviewChange,
  type ReviewSentence,
} from '../lib/spelling'
import type { CheatsheetEntry, Meaning } from '../lib/cheatsheet'
import { targetById, useTargetLanguage, type TargetLanguage } from '../lib/languages'
import { entryFor } from '../lib/translateWords'
import { loadWordOptions, type WordAlternatives } from '../lib/wordOptions'

// The journal: entries written in the target language (English where the learner doesn't know a word yet),
// latest on top. Each shows the user's own words untouched (blue), and underneath, Mai's corrected copy
// (red), sentence by sentence, from which-dialect's journal review.

type Editing = { entry?: JournalEntry } | null
// Per entry: a check in progress, or the last one that failed.
type CheckState = Record<string, 'checking' | 'failed'>

export function Journal() {
  const [target] = useTargetLanguage()
  const { entries, error, save, remove } = useJournal()
  const [extraChecks] = useJournalExtraChecks()
  const [editing, setEditing] = useState<Editing>(null)
  const [checks, setChecks] = useState<CheckState>({})
  // The latest entries, for checks that finish after the entry was edited again.
  const entriesRef = useRef(entries)
  useLayoutEffect(() => {
    entriesRef.current = entries
  })

  const runCheck = async (entry: JournalEntry) => {
    if (!entry.text || !backendConfigured) return
    setChecks((c) => ({ ...c, [entry.id]: 'checking' }))
    try {
      const check = await checkSpelling(targetById(entry.targetId), entry.text, extraChecks)
      // Saved onto the entry as it is now, unless its words changed while Mai was checking.
      const latest = entriesRef.current?.find((e) => e.id === entry.id)
      if (latest && latest.text === entry.text) await save({ ...latest, check })
      setChecks((c) => {
        const next = { ...c }
        delete next[entry.id]
        return next
      })
    } catch {
      setChecks((c) => ({ ...c, [entry.id]: 'failed' }))
    }
  }

  const onSave = async (entry: JournalEntry) => {
    await save(entry)
    setEditing(null)
    window.scrollTo(0, 0)
    // Check again only when the words changed since the last check.
    if (entry.text && entry.check?.input !== entry.text) void runCheck(entry)
  }

  return (
    <main className="app">
      <header className="header">
        <h1>Journal</h1>
        <p className="muted">
          Write a little about your day in <strong>{target.label}</strong>. Stuck on a word? Write it in English and
          Mai fills it in. Your words stay as you wrote them, in blue; Mai's corrected copy goes underneath, in
          red.
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      {editing ? (
        <JournalEditor
          key={editing.entry?.id ?? 'new'}
          target={editing.entry ? targetById(editing.entry.targetId) : target}
          entry={editing.entry}
          onSave={onSave}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="footer-actions journal-new">
          <button type="button" className="primary" onClick={() => setEditing({})}>
            ✎ New entry
          </button>
        </div>
      )}

      {entries === null ? (
        <p className="muted">Loading your journal…</p>
      ) : entries.length === 0 ? (
        !editing && (
          <section className="card">
            <p className="muted">
              No entries yet. Write one, or record an audio note and type out what you said: typed words are what
              Mai can check.
            </p>
          </section>
        )
      ) : (
        <ol className="journal-list">
          {entries
            .filter((e) => e.id !== editing?.entry?.id)
            .map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                checkState={checks[entry.id]}
                onCheck={() => runCheck(entry)}
                extraChecks={extraChecks}
                onAcceptHint={(key) =>
                  entry.check &&
                  save({ ...entry, check: { ...entry.check, acceptedHints: [...(entry.check.acceptedHints ?? []), key] } })
                }
                onPickWord={(key, word) =>
                  entry.check && save({ ...entry, check: { ...entry.check, wordPicks: { ...entry.check.wordPicks, [key]: word } } })
                }
                onEdit={() => {
                  setEditing({ entry })
                  window.scrollTo(0, 0)
                }}
                onDelete={() => remove(entry.id)}
              />
            ))}
        </ol>
      )}
    </main>
  )
}

const formatWhen = (when: string) =>
  new Date(when).toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

type CardProps = {
  entry: JournalEntry
  checkState?: 'checking' | 'failed'
  onCheck: () => void
  extraChecks: boolean
  onAcceptHint: (key: string) => void
  onPickWord: (key: string, word: string) => void
  onEdit: () => void
  onDelete: () => void
}

function EntryCard({ entry, checkState, onCheck, extraChecks, onAcceptHint, onPickWord, onEdit, onDelete }: CardProps) {
  const [confirming, setConfirming] = useState(false)
  const lang = targetById(entry.targetId)
  // A check from before the entry was last edited (or in an older format) doesn't count.
  const check =
    entry.check?.input === entry.text && entry.check.review && 'extraChecks' in entry.check ? entry.check : undefined

  return (
    <li className="card journal-entry">
      <div className="card-head">
        <h2>
          <time dateTime={entry.when}>{formatWhen(entry.when)}</time>
        </h2>
        <span className="language-tag">{lang.label}</span>
      </div>

      {(entry.text || entry.items.length > 0) && (
        <JournalSheet text={entry.text} items={entry.items} lang={lang.code} />
      )}
      {entry.audio && <AudioNotePlayer audio={entry.audio} />}

      {entry.text ? (
        <Correction
          check={check}
          state={checkState}
          onCheck={onCheck}
          extraChecks={extraChecks}
          onAcceptHint={onAcceptHint}
          onPickWord={onPickWord}
          target={lang}
        />
      ) : (
        <p className="journal-nudge">
          Type out what you said in your audio note so Mai can check it. <button type="button" className="inline-link" onClick={onEdit}>Add it now</button>
        </p>
      )}

      <div className="journal-entry-actions">
        <button type="button" className="chip" onClick={onEdit}>
          Edit
        </button>
        {confirming ? (
          <span className="journal-confirm">
            Delete this entry?{' '}
            <button type="button" className="chip danger" onClick={onDelete}>
              Delete
            </button>{' '}
            <button type="button" className="chip" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="chip" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
    </li>
  )
}

type CorrectionProps = {
  check?: SpellingCheck
  state?: 'checking' | 'failed'
  onCheck: () => void
  /** The current setting, to offer a new check when the entry was checked with the other one. */
  extraChecks: boolean
  onAcceptHint: (key: string) => void
  onPickWord: (key: string, word: string) => void
  target: TargetLanguage
}

function Correction({ check, state, onCheck, extraChecks, onAcceptHint, onPickWord, target }: CorrectionProps) {
  const lang = target.code
  if (!backendConfigured) {
    return <p className="muted journal-check-status">Corrections aren't set up on this site yet.</p>
  }
  if (state === 'checking') return <p className="muted journal-check-status">Mai is checking your entry…</p>
  if (!check) {
    return (
      <p className="muted journal-check-status">
        {state === 'failed' ? "Couldn't check the entry. " : 'Not checked yet. '}
        <button type="button" className="inline-link" onClick={onCheck}>
          {state === 'failed' ? 'Try again' : 'Check now'}
        </button>
      </p>
    )
  }

  const review = withAcceptedHints(check)
  const { changes, hints, frames } = reviewNotes(review)
  const accepted = new Set(check.acceptedHints ?? [])
  const openHints = hints.filter((h) => !accepted.has(h.key) && h.suggestions[0] !== undefined)
  const kinds = [...new Map(changes.map((c) => [kindOf(c.kind).color, kindOf(c.kind)])).values()]
  // Hints by sentence, to show each under its sentence.
  const hintsIn = (si: number) => openHints.filter((h) => h.key.startsWith(`${si}:`))

  return (
    <section className="journal-correction" aria-label="Mai's corrections">
      <div className="journal-correction-head">
        <p className="journal-correction-label">
          {changes.length
            ? `Corrected by Mai · ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`
            : 'Checked by Mai'}
        </p>
        {kinds.length > 0 && (
          <ul className="change-legend" aria-label="Kinds of changes">
            {kinds.map((k) => (
              <li key={k.color} data-kind={k.color}>
                {k.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {changes.length === 0 && openHints.length === 0 ? (
        <p className="muted">Nothing to correct. (Mai only points out what she's sure about.)</p>
      ) : (
        <ol className="journal-sentences">
          {review.sentences.map((s, si) => (
            <SentenceView
              key={si}
              index={si}
              sentence={s}
              hints={hintsIn(si)}
              picks={check.wordPicks ?? {}}
              onAcceptHint={onAcceptHint}
              onPickWord={onPickWord}
              target={target}
            />
          ))}
        </ol>
      )}

      {check.extraChecks !== extraChecks && (
        <p className="muted journal-check-status">
          Checked {check.extraChecks ? 'with' : 'without'} regional words and pronouns.{' '}
          <button type="button" className="inline-link" onClick={onCheck}>
            Check again {extraChecks ? 'with' : 'without'} them
          </button>
        </p>
      )}

      {frames.length > 0 && (
        <details className="journal-frames">
          <summary>💡 Frames for this entry ({frames.length})</summary>
          <ul>
            {frames.map((f) => (
              <li key={f.id}>
                <span lang={lang}>{f.text}</span> <span className="muted">· {f.en}</span>
              </li>
            ))}
          </ul>
          <p className="muted">Reuse them in your next entry: open “Sentence frames” when you write.</p>
        </details>
      )}
    </section>
  )
}

type SentenceProps = {
  index: number
  sentence: ReviewSentence
  hints: KeyedHint[]
  picks: Record<string, string>
  onAcceptHint: (key: string) => void
  onPickWord: (key: string, word: string) => void
  target: TargetLanguage
}

// One corrected sentence, changed words highlighted by kind (tap one for why), and under it the changes
// grouped by kind ("Toi → Tôi · muon → muốn (Accents and spelling)"), tips and words Mai couldn't correct.
function SentenceView({ index, sentence, hints, picks, onAcceptHint, onPickWord, target }: SentenceProps) {
  const lang = target.code
  const keyOf = (c: ReviewChange) => changeKey(index, sentence.changes.indexOf(c))
  // Each piece with where it starts in the corrected sentence, to key picks on words Mai left alone.
  const pieces: (Piece & { start: number })[] = []
  for (const p of sentencePieces(sentence)) {
    const last = pieces[pieces.length - 1]
    pieces.push({ ...p, start: last ? last.start + last.text.length : 0 })
  }
  // The learner's own picks on words Mai left alone, for the notes ("nay → này").
  // The sentence's words of several syllables, shifted to be relative to a piece starting at `from`; only
  // those that lie wholly inside it (a change that overlaps one takes precedence).
  const shift = (from: number, to = sentence.corrected.length) =>
    (sentence.words ?? []).filter((w) => w.start >= from && w.end <= to).map((w) => ({ start: w.start - from, end: w.end - from }))
  const ownPicks = Object.entries(picks)
    .filter(([key]) => key.startsWith(`${index}@`))
    .map(([key, pick]) => {
      const offset = Number(key.slice(key.indexOf('@') + 1))
      const word = wordTokens(sentence.corrected.slice(offset), shift(offset))[0]?.text ?? ''
      return { word, pick: keepCapital(word, pick) }
    })
    .filter((p) => p.word && p.word.toLowerCase() !== p.pick.toLowerCase())
  const changed = sentence.changes.length > 0
  const groups = new Map<string, ReviewChange[]>()
  for (const c of sentence.changes) groups.set(kindOf(c.kind).label, [...(groups.get(kindOf(c.kind).label) ?? []), c])

  return (
    <li className={changed ? 'journal-sentence changed' : 'journal-sentence'}>
      <p className="journal-corrected" lang={lang}>
        <span className="sentence-mark" aria-hidden="true">
          {changed ? '✓' : '·'}
        </span>
        {pieces.map((p, i) =>
          p.change ? (
            <ChangeMark
              key={i}
              change={p.change}
              shown={shownWord(p.change, picks[keyOf(p.change)])}
              onPick={(word) => onPickWord(keyOf(p.change!), word)}
              target={target}
            />
          ) : (
            // Words Mai left alone: hover for their meaning, other accents and other words.
            wordTokens(p.text, shift(p.start, p.start + p.text.length)).map((t) => {
              if (!t.word) return <span key={`${i}-${t.start}`}>{t.text}</span>
              const key = keptWordKey(index, p.start + t.start)
              return (
                <WordMark
                  key={`${i}-${t.start}`}
                  word={t.text}
                  pick={picks[key]}
                  onPick={(word) => onPickWord(key, word)}
                  target={target}
                />
              )
            })
          ),
        )}
      </p>
      {(groups.size > 0 || hints.length > 0 || sentence.unchecked.length > 0 || ownPicks.length > 0) && (
        <ul className="journal-notes">
          {ownPicks.length > 0 && (
            <li>
              {ownPicks.map((p, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <s lang={lang}>{p.word}</s> → <strong lang={lang}>{p.pick}</strong>
                </span>
              ))}{' '}
              <span className="muted">(your {ownPicks.length === 1 ? 'pick' : 'picks'})</span>
            </li>
          )}
          {[...groups].map(([label, list]) => (
            <li key={label}>
              {list.map((c, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <s lang={lang}>{c.from}</s> →{' '}
                  {c.to ? <strong lang={lang}>{shownWord(c, picks[keyOf(c)])}</strong> : <em>left out</em>}
                </span>
              ))}{' '}
              <span className="muted">({label})</span>
            </li>
          ))}
          {hints.map((h) => (
            <li key={h.key} className="journal-tip">
              Tip: {h.message}{' '}
              <button type="button" className="chip" onClick={() => onAcceptHint(h.key)}>
                Use “{h.suggestions[0]}”
              </button>
            </li>
          ))}
          {sentence.unchecked.map((u, i) => (
            <li key={`u-${i}`} className="journal-tip">
              Couldn't correct “{u}”: no {target.label} word found, so it's left as written.
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

type ChangeMarkProps = {
  change: ReviewChange
  /** The word shown: the learner's pick, or the review's. */
  shown: string
  onPick: (word: string) => void
  target: TargetLanguage
}

// A changed word in the corrected copy. Hover (or tap) opens a box like the Cheatsheet's: why it changed,
// and the other words it could be, to star the one that fits. English words Mai translated show every
// meaning of the English word with its translations (the meaning holding Mai's word first, since that's
// the one the sentence uses); other changes show the checker's alternatives ("khong": không, khổng, khống).
function ChangeMark({ change, shown, onPick, target }: ChangeMarkProps) {
  const kind = kindOf(change.kind)
  const lang = target.code
  const hasOptions = (change.options?.length ?? 0) > 1
  // Every correction to a word can be looked at and changed: English words through their Cheatsheet entry,
  // the others through the spellchecker's options and the word's own alternatives. Frame clauses can't.
  const choosable = change.kind === 'foreign-word' || (change.kind !== 'frame' && Boolean(change.to))
  return (
    <Popover
      title={`${change.from} → ${shown}`}
      trigger={
        <>
          {shown}
          {choosable && <span className="choice-dot" aria-hidden="true" />}
        </>
      }
      triggerClassName="change-mark"
      triggerLabel={`${shown}, changed from “${change.from}”: ${kind.label}${choosable ? '. Other words to choose from' : ''}`}
      wrapClassName={`change-wrap kind-${kind.color}`}
      lang={lang}
      align="start"
      contentKey={shown}
    >
      <p className="change-why">
        <span className="change-kind" data-kind={kind.color}>
          {kind.label}
        </span>
        <span>
          <s lang={lang}>{change.from}</s> → <strong lang={lang}>{shown}</strong>
        </span>
        <span>{change.why}</span>
      </p>
      {change.kind === 'foreign-word' ? (
        <TranslationChoices change={change} shown={shown} onPick={onPick} target={target} />
      ) : (
        choosable && (
          <>
            {hasOptions && (
              <WordOptions words={change.options!} shown={shown} reviewWord={change.to} onPick={onPick} lang={lang} />
            )}
            <WordAlternativesBox
              word={change.to}
              shown={shown}
              onPick={onPick}
              target={target}
              tag="Mai's pick"
              skipAccents={hasOptions}
            />
          </>
        )
      )}
    </Popover>
  )
}

// A word to choose: the checker's suggestion with its meanings, or a Cheatsheet translation with its gloss.
type Choice = WordOption | { text: string; gloss?: string; regions?: string[]; labels?: string[] }

type WordOptionsProps = {
  words: Choice[]
  shown: string
  /** The review's own choice (or the learner's own word), tagged with `tag`. */
  reviewWord: string
  tag?: string
  onPick: (word: string) => void
  lang: string
}

// Words to star, like the Cheatsheet's translation box, each with what it means so the learner can tell
// them apart ("muốn" to want, "muộn" late, "mượn" to borrow).
function WordOptions({ words, shown, reviewWord, tag = "Mai's pick", onPick, lang }: WordOptionsProps) {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  return (
    <div className="tip-options" role="group" aria-label="Words to choose from">
      <p className="tip-note-label">Star the one that fits</p>
      <ul>
        {words.map((option) => {
          const isPicked = same(option.text, shown)
          return (
            <li key={option.text}>
              <button
                type="button"
                className={isPicked ? 'tip-option picked' : 'tip-option'}
                aria-pressed={isPicked}
                onClick={() => onPick(option.text)}
              >
                <span className="star" aria-hidden="true">
                  {isPicked ? '★' : '☆'}
                </span>
                <span className="tip-option-text" lang={lang}>
                  {option.text}
                </span>
                <span className="tip-option-usage">
                  {'meanings' in option ? (
                    option.meanings.length ? (
                      option.meanings.map((m, mi) => (
                        <span key={mi} className="option-meaning">
                          <span className="pos-name">{m.posName}</span> {m.gloss}
                          {m.regions?.length ? <span className="region-badge"> {m.regions.join(', ')}</span> : null}
                          {m.labels?.length ? <span className="label-chips"> {m.labels.join(', ')}</span> : null}
                        </span>
                      ))
                    ) : (
                      <span className="muted">No definition found</span>
                    )
                  ) : (
                    <>
                      {option.gloss}
                      {option.regions?.length ? <span className="region-badge"> {option.regions.join(', ')}</span> : null}
                      {option.labels?.length ? <span className="label-chips"> {option.labels.join(', ')}</span> : null}
                    </>
                  )}
                </span>
                {same(option.text, reviewWord) && <span className="default-tag">{tag}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// An English word's meanings, each with its translations (the Cheatsheet's data, from the backend).
function TranslationChoices({ change, shown, onPick, target }: Omit<ChangeMarkProps, 'change'> & { change: ReviewChange }) {
  const [entry, setEntry] = useState<CheatsheetEntry | null | undefined>(undefined)
  const [meaningId, setMeaningId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    entryFor(target, change.from.toLowerCase())
      .then((e) => !cancelled && setEntry(e))
      .catch(() => !cancelled && setEntry(null))
    return () => {
      cancelled = true
    }
  }, [target, change.from])

  // No meanings to show: the checker's words, if it had more than one.
  const fallback =
    (change.options?.length ?? 0) > 1 ? (
      <WordOptions
        words={change.options!.map((o) => ({ text: o.text }))}
        shown={shown}
        reviewWord={change.to}
        onPick={onPick}
        lang={target.code}
      />
    ) : null
  if (entry === undefined) return <p className="muted">Looking up “{change.from}”…</p>
  const meanings = entry?.meanings.filter((m) => m.options.length > 0) ?? []
  if (!meanings.length) return fallback

  // The meaning the sentence uses: the one holding the shown word, else the one holding Mai's word.
  const holds = (m: Meaning, w: string) => m.options.some((o) => o.text.toLowerCase() === w.toLowerCase())
  const meaning =
    meanings.find((m) => m.id === meaningId) ??
    meanings.find((m) => holds(m, shown)) ??
    meanings.find((m) => holds(m, change.to)) ??
    meanings[0]

  const others = meanings.filter((m) => m.id !== meaning.id)
  return (
    <>
      <p className="tip-meaning">
        <span className="pos-name">{meaning.posName ?? meaning.pos}</span> {meaning.gloss}
      </p>
      <WordOptions words={meaning.options} shown={shown} reviewWord={change.to} onPick={onPick} lang={target.code} />
      {others.length > 0 && (
        <details className="other-meanings">
          <summary>
            Other meanings of “{change.from}” ({others.length})
          </summary>
          <ul className="tip-options" aria-label={`Other meanings of “${change.from}”`}>
            {others.map((m) => (
              <li key={m.id}>
                <button type="button" className="tip-option meaning-option" onClick={() => setMeaningId(m.id)}>
                  <span className="pos-name">{m.posName ?? m.pos}</span>
                  <span className="tip-option-usage">
                    <span className="meaning-gloss">{m.gloss}</span>
                    <span className="meaning-example" lang={target.code}>
                      {m.options
                        .slice(0, 3)
                        .map((o) => o.text)
                        .join(', ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

type WordMarkProps = { word: string; pick?: string; onPick: (word: string) => void; target: TargetLanguage }

// A word Mai left as it is. Hover (or tap) for a box like the Cheatsheet's: what it means, the same letters
// with other accents (a real word with the wrong tone passes the spellchecker), and other words with the
// same meaning, to star another one. A pick shows in place of the word, tinted.
function WordMark({ word, pick, onPick, target }: WordMarkProps) {
  const shown = pick === undefined ? word : keepCapital(word, pick)
  const changed = shown.toLowerCase() !== word.toLowerCase()
  return (
    <Popover
      title={shown}
      trigger={shown}
      triggerClassName={changed ? 'word-mark picked' : 'word-mark'}
      triggerLabel={`${shown}: see what it means and other words`}
      wrapClassName="word-wrap"
      lang={target.code}
      align="start"
      contentKey={shown}
    >
      <WordAlternativesBox word={word} shown={shown} onPick={onPick} target={target} />
    </Popover>
  )
}

type WordAlternativesProps = Omit<WordMarkProps, 'pick'> & {
  shown: string
  /** How the word itself is tagged in the lists: the learner's ("your word") or Mai's correction. */
  tag?: string
  /** Leave out "Same letters, other accents" (a correction already lists the spellchecker's). */
  skipAccents?: boolean
}

// A word's meaning and the words that could replace it, loaded from `word-options`: for words Mai left
// alone, and for corrections, so "hom nay" → "hôm nay" also shows "today" and "bữa nay".
function WordAlternativesBox({ word, shown, onPick, target, tag = 'your word', skipAccents = false }: WordAlternativesProps) {
  const [options, setOptions] = useState<WordAlternatives | null | undefined>(undefined)

  // Loaded the first time the box opens (the Popover renders its content only while open).
  useEffect(() => {
    let cancelled = false
    loadWordOptions(target, word)
      .then((o) => !cancelled && setOptions(o))
      .catch(() => !cancelled && setOptions(null))
    return () => {
      cancelled = true
    }
  }, [target, word])

  if (options === undefined) return <p className="muted">Looking up “{word}”…</p>
  if (options === null) return <p className="muted">Couldn't look up “{word}”.</p>

  const own = { ...options.word, text: word.toLowerCase() }
  const lang = target.code
  const accents = skipAccents ? [] : options.accents
  const alternatives = accents.length + options.synonyms.length > 0
  return (
    <>
      {/* With alternatives, the word's meanings show on its own row in the list; with skipAccents, in the
          correction's list above. */}
      {!alternatives && !skipAccents &&
        (own.meanings.length ? (
          <div className="tip-meanings">
            {own.meanings.map((m, i) => (
              <p key={i} className="tip-meaning">
                <span className="pos-name">{m.posName}</span> {m.gloss}
                {m.regions?.length ? <span className="region-badge"> {m.regions.join(', ')}</span> : null}
              </p>
            ))}
          </div>
        ) : (
          <p className="muted">No definition found for “{word}”.</p>
        ))}
      {accents.length > 0 && (
        <>
          <p className="tip-note-label word-options-label">Same letters, other accents</p>
          <WordOptions words={[own, ...accents]} shown={shown} reviewWord={own.text} tag={tag} onPick={onPick} lang={lang} />
        </>
      )}
      {options.synonyms.length > 0 && (
        <>
          <p className="tip-note-label word-options-label">Same meaning, other words</p>
          <WordOptions
            words={accents.length || skipAccents ? options.synonyms : [own, ...options.synonyms]}
            shown={shown}
            reviewWord={own.text}
            tag={tag}
            onPick={onPick}
            lang={lang}
          />
        </>
      )}
      {!alternatives && !skipAccents && <p className="muted">No other words to choose from.</p>}
    </>
  )
}
