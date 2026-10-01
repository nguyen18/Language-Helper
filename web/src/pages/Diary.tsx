import { useLayoutEffect, useRef, useState } from 'react'
import { AudioNotePlayer } from '../components/AudioNoteRecorder'
import { DiaryEditor } from '../components/DiaryEditor'
import { DiarySheet } from '../components/DiarySheet'
import { backendConfigured } from '../lib/backend'
import { useDiary, type DiaryEntry } from '../lib/diary'
import { checkGrammar, correctedPieces, grammarTips, type GrammarCheck } from '../lib/grammar'
import { targetById, useTargetLanguage } from '../lib/languages'

// The diary: entries written in the target language only, latest on top. Each shows the user's own
// words untouched (blue), and underneath, Mai's corrected copy (red) from the grammar checker.

type Editing = { entry?: DiaryEntry } | null
// Per entry: a check in progress, or the last one that failed.
type CheckState = Record<string, 'checking' | 'failed'>

export function Diary() {
  const [target] = useTargetLanguage()
  const { entries, error, save, remove } = useDiary()
  const [editing, setEditing] = useState<Editing>(null)
  const [checks, setChecks] = useState<CheckState>({})
  // The latest entries, for checks that finish after the entry was edited again.
  const entriesRef = useRef(entries)
  useLayoutEffect(() => {
    entriesRef.current = entries
  })

  const runCheck = async (entry: DiaryEntry) => {
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

  const onSave = async (entry: DiaryEntry) => {
    await save(entry)
    setEditing(null)
    window.scrollTo(0, 0)
    // Check again only when the words changed since the last check.
    if (entry.text && entry.check?.input !== entry.text) void runCheck(entry)
  }

  return (
    <main className="app">
      <header className="header">
        <h1>Diary</h1>
        <p className="muted">
          Write a little about your day in <strong>{target.label}</strong>, and only {target.label}. Your words stay
          as you wrote them, in blue; Mai's corrected copy goes underneath, in red.
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      {editing ? (
        <DiaryEditor
          key={editing.entry?.id ?? 'new'}
          target={editing.entry ? targetById(editing.entry.targetId) : target}
          entry={editing.entry}
          onSave={onSave}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="footer-actions diary-new">
          <button type="button" className="primary" onClick={() => setEditing({})}>
            ✎ New entry
          </button>
        </div>
      )}

      {entries === null ? (
        <p className="muted">Loading your diary…</p>
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
        <ol className="diary-list">
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
  entry: DiaryEntry
  checkState?: 'checking' | 'failed'
  onCheck: () => void
  onEdit: () => void
  onDelete: () => void
}

function EntryCard({ entry, checkState, onCheck, onEdit, onDelete }: CardProps) {
  const [confirming, setConfirming] = useState(false)
  const lang = targetById(entry.targetId)
  const check = entry.check?.input === entry.text ? entry.check : undefined

  return (
    <li className="card diary-entry">
      <div className="card-head">
        <h2>
          <time dateTime={entry.when}>{formatWhen(entry.when)}</time>
        </h2>
        <span className="language-tag">{lang.label}</span>
      </div>

      {(entry.text || entry.items.length > 0) && (
        <DiarySheet text={entry.text} items={entry.items} lang={lang.code} />
      )}
      {entry.audio && <AudioNotePlayer audio={entry.audio} />}

      {entry.text ? (
        <Correction check={check} state={checkState} onCheck={onCheck} lang={lang.code} />
      ) : (
        <p className="diary-nudge">
          Type out what you said in your audio note so Mai can check it. <button type="button" className="inline-link" onClick={onEdit}>Add it now</button>
        </p>
      )}

      <div className="diary-entry-actions">
        <button type="button" className="chip" onClick={onEdit}>
          Edit
        </button>
        {confirming ? (
          <span className="diary-confirm">
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
    return <p className="muted diary-check-status">Grammar checking isn't set up on this site yet.</p>
  }
  if (state === 'checking') return <p className="muted diary-check-status">Mai is checking your grammar…</p>
  if (!check) {
    return (
      <p className="muted diary-check-status">
        {state === 'failed' ? "Couldn't check the grammar. " : 'Not checked yet. '}
        <button type="button" className="inline-link" onClick={onCheck}>
          {state === 'failed' ? 'Try again' : 'Check now'}
        </button>
      </p>
    )
  }

  const pieces = correctedPieces(check)
  const fixes = pieces.filter((p) => p.fix)
  const tips = grammarTips(check)

  return (
    <section className="diary-correction" aria-label="Mai's corrections">
      <p className="diary-correction-label">
        {fixes.length ? `Corrected by Mai · ${fixes.length} ${fixes.length === 1 ? 'change' : 'changes'}` : 'Checked by Mai'}
      </p>
      {fixes.length ? (
        <p className="diary-corrected" lang={lang}>
          {pieces.map((p, i) =>
            p.fix ? (
              <mark key={i} title={`${p.fix.from} → ${p.text}: ${p.fix.issue.message}`}>
                {p.text}
              </mark>
            ) : (
              p.text
            ),
          )}
        </p>
      ) : (
        <p className="muted">Nothing to correct. (Mai only points out what she's sure about.)</p>
      )}
      {fixes.length + tips.length > 0 && (
        <ul className="diary-notes">
          {fixes.map((p, i) => (
            <li key={`fix-${i}`}>
              <s>{p.fix!.from}</s> → <strong>{p.text}</strong>: {p.fix!.issue.message}
            </li>
          ))}
          {tips.map((t, i) => (
            <li key={`tip-${i}`} className="diary-tip">
              Tip: {t.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
