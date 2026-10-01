import { useLayoutEffect, useRef, useState } from 'react'
import { AudioNotePlayer } from '../components/AudioNoteRecorder'
import { JournalEditor } from '../components/JournalEditor'
import { JournalSheet } from '../components/JournalSheet'
import { backendConfigured } from '../lib/backend'
import { useJournal, useJournalExtraChecks, type JournalEntry } from '../lib/journal'
import { Popover } from '../components/Popover'
import {
  checkGrammar,
  kindOf,
  reviewNotes,
  sentencePieces,
  withAcceptedHints,
  type GrammarCheck,
  type KeyedHint,
  type ReviewChange,
  type ReviewSentence,
} from '../lib/grammar'
import { targetById, useTargetLanguage } from '../lib/languages'

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
      const check = await checkGrammar(targetById(entry.targetId), entry.text, extraChecks)
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
  onEdit: () => void
  onDelete: () => void
}

function EntryCard({ entry, checkState, onCheck, extraChecks, onAcceptHint, onEdit, onDelete }: CardProps) {
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
          lang={lang.code}
          languageLabel={lang.label}
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
  check?: GrammarCheck
  state?: 'checking' | 'failed'
  onCheck: () => void
  /** The current setting, to offer a new check when the entry was checked with the other one. */
  extraChecks: boolean
  onAcceptHint: (key: string) => void
  lang: string
  languageLabel: string
}

function Correction({ check, state, onCheck, extraChecks, onAcceptHint, lang, languageLabel }: CorrectionProps) {
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
              sentence={s}
              hints={hintsIn(si)}
              onAcceptHint={onAcceptHint}
              lang={lang}
              languageLabel={languageLabel}
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
  sentence: ReviewSentence
  hints: KeyedHint[]
  onAcceptHint: (key: string) => void
  lang: string
  languageLabel: string
}

// One corrected sentence, changed words highlighted by kind (tap one for why), and under it the changes
// grouped by kind ("Toi → Tôi · muon → muốn (Accents and spelling)"), tips and words Mai couldn't correct.
function SentenceView({ sentence, hints, onAcceptHint, lang, languageLabel }: SentenceProps) {
  const changed = sentence.changes.length > 0
  const groups = new Map<string, ReviewChange[]>()
  for (const c of sentence.changes) groups.set(kindOf(c.kind).label, [...(groups.get(kindOf(c.kind).label) ?? []), c])

  return (
    <li className={changed ? 'journal-sentence changed' : 'journal-sentence'}>
      <p className="journal-corrected" lang={lang}>
        <span className="sentence-mark" aria-hidden="true">
          {changed ? '✓' : '·'}
        </span>
        {sentencePieces(sentence).map((p, i) =>
          p.change ? <ChangeMark key={i} change={p.change} text={p.text} lang={lang} /> : <span key={i}>{p.text}</span>,
        )}
      </p>
      {(groups.size > 0 || hints.length > 0 || sentence.unchecked.length > 0) && (
        <ul className="journal-notes">
          {[...groups].map(([label, list]) => (
            <li key={label}>
              {list.map((c, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <s lang={lang}>{c.from}</s> → {c.to ? <strong lang={lang}>{c.to}</strong> : <em>left out</em>}
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
              Couldn't correct “{u}”: no {languageLabel} word found, so it's left as written.
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ChangeMark({ change, text, lang }: { change: ReviewChange; text: string; lang: string }) {
  const kind = kindOf(change.kind)
  return (
    <Popover
      title={`${change.from} → ${change.to}`}
      trigger={text}
      triggerClassName="change-mark"
      triggerLabel={`${text}, changed from “${change.from}”: ${kind.label}`}
      wrapClassName={`change-wrap kind-${kind.color}`}
      lang={lang}
      align="start"
    >
      <p className="change-why">
        <span className="change-kind" data-kind={kind.color}>
          {kind.label}
        </span>
        <span>
          <s lang={lang}>{change.from}</s> → <strong lang={lang}>{change.to}</strong>
        </span>
        <span>{change.why}</span>
      </p>
    </Popover>
  )
}
