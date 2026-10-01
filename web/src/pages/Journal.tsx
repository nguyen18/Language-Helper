import { useLayoutEffect, useRef, useState } from 'react'
import { AudioNotePlayer } from '../components/AudioNoteRecorder'
import { JournalEditor } from '../components/JournalEditor'
import { JournalSheet } from '../components/JournalSheet'
import { backendConfigured } from '../lib/backend'
import { useJournal, type JournalEntry } from '../lib/journal'
import { checkGrammar, correctedPieces, reviewNotes, type GrammarCheck } from '../lib/grammar'
import { targetById, useTargetLanguage } from '../lib/languages'

// The journal: entries written in the target language only, latest on top. Each shows the user's own
// words untouched (blue), and underneath, Mai's corrected copy (red) from the grammar checker.

type Editing = { entry?: JournalEntry } | null
// Per entry: a check in progress, or the last one that failed.
type CheckState = Record<string, 'checking' | 'failed'>

export function Journal() {
  const [target] = useTargetLanguage()
  const { entries, error, save, remove } = useJournal()
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
      const check = await checkGrammar(targetById(entry.targetId), entry.text)
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
          Write a little about your day in <strong>{target.label}</strong>, and only {target.label}. Your words stay
          as you wrote them, in blue; Mai's corrected copy goes underneath, in red.
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
  onEdit: () => void
  onDelete: () => void
}

function EntryCard({ entry, checkState, onCheck, onEdit, onDelete }: CardProps) {
  const [confirming, setConfirming] = useState(false)
  const lang = targetById(entry.targetId)
  // A check from before the entry was last edited (or in an older format) doesn't count.
  const check = entry.check?.input === entry.text && entry.check.review ? entry.check : undefined

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
        <Correction check={check} state={checkState} onCheck={onCheck} lang={lang.code} />
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

type CorrectionProps = { check?: GrammarCheck; state?: 'checking' | 'failed'; onCheck: () => void; lang: string }

function Correction({ check, state, onCheck, lang }: CorrectionProps) {
  if (!backendConfigured) {
    return <p className="muted journal-check-status">Grammar checking isn't set up on this site yet.</p>
  }
  if (state === 'checking') return <p className="muted journal-check-status">Mai is checking your grammar…</p>
  if (!check) {
    return (
      <p className="muted journal-check-status">
        {state === 'failed' ? "Couldn't check the grammar. " : 'Not checked yet. '}
        <button type="button" className="inline-link" onClick={onCheck}>
          {state === 'failed' ? 'Try again' : 'Check now'}
        </button>
      </p>
    )
  }

  const pieces = correctedPieces(check.review)
  const { changes, hints, frames, unchecked } = reviewNotes(check.review)

  return (
    <section className="journal-correction" aria-label="Mai's corrections">
      <p className="journal-correction-label">
        {changes.length ? `Corrected by Mai · ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}` : 'Checked by Mai'}
      </p>
      {changes.length ? (
        <p className="journal-corrected" lang={lang}>
          {pieces.map((p, i) => (p.changed ? <mark key={i}>{p.text}</mark> : p.text))}
        </p>
      ) : (
        <p className="muted">Nothing to correct. (Mai only points out what she's sure about.)</p>
      )}
      {changes.length + hints.length + unchecked.length > 0 && (
        <ul className="journal-notes">
          {changes.map((c, i) => (
            <li key={`change-${i}`}>
              {c.from ? <s lang={lang}>{c.from}</s> : 'Add'} → <strong lang={lang}>{c.to}</strong>: {c.why}
            </li>
          ))}
          {hints.map((h, i) => (
            <li key={`hint-${i}`} className="journal-tip">
              Tip: {h.message}
            </li>
          ))}
          {unchecked.map((u, i) => (
            <li key={`unchecked-${i}`} className="journal-tip">
              Mai couldn't check “{u}”. Try writing it in the language you're learning.
            </li>
          ))}
        </ul>
      )}
      {frames.length > 0 && (
        <details className="journal-frames">
          <summary>
            Sentence patterns you used ({frames.length})
          </summary>
          <ul>
            {frames.map((f) => (
              <li key={f.id}>
                <span lang={lang}>{f.text}</span> <span className="muted">· {f.en}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
