import { use, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Popover } from '../components/Popover'
import { loadTop100, type CheatsheetEntry, type CheatsheetList, type Meaning } from '../lib/cheatsheet'
import { meaningKey, optionKey, usePicks, type Picks } from '../lib/cheatsheetPicks'
import { toCheatsheetList, useCustomLists, type CustomEntry, type CustomList } from '../lib/customLists'

export function Cheatsheet() {
  // Suspends until the list's data has loaded (App shows a loading message meanwhile).
  const top100 = use(loadTop100())
  const { picks, setPick } = usePicks()
  const custom = useCustomLists()
  const [creating, setCreating] = useState(false)

  return (
    <main className="app">
      <header className="header">
        <h1>Cheatsheet</h1>
        <p className="muted">Handy word lists to keep nearby while you learn.</p>
      </header>

      <ListCard list={top100} picks={picks} setPick={setPick} />

      {custom.lists.map((list) => (
        <ListCard
          key={list.id}
          list={toCheatsheetList(list)}
          picks={picks}
          setPick={setPick}
          onRemoveEntry={(word) => custom.removeEntry(list.id, word)}
        >
          <CustomListControls
            list={list}
            onAdd={(entry) => custom.addEntry(list.id, entry)}
            onDelete={() => custom.deleteList(list.id)}
          />
        </ListCard>
      ))}

      {creating ? (
        <NewListForm
          onCreate={(title) => {
            custom.addList(title)
            setCreating(false)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className="add-list" onClick={() => setCreating(true)}>
          + Add a new list
        </button>
      )}
    </main>
  )
}

type ListCardProps = {
  list: CheatsheetList
  picks: Picks
  setPick: (key: string, value: string | null) => void
  // Custom lists only: shows a remove button on each word.
  onRemoveEntry?: (word: string) => void
  // Custom lists only: the add-word form and list actions, shown under the words.
  children?: ReactNode
}

// One word list as a collapsible card. Built-in and custom lists share it.
function ListCard({ list, picks, setPick, onRemoveEntry, children }: ListCardProps) {
  const hasMeanings = list.entries.some((e) => e.meanings.length > 1 || e.meanings[0]?.pos)
  return (
    // Native <details>: collapsible with keyboard and screen reader support; the summary (title) stays visible.
    <details className="card cheat-list" open>
      <summary className="card-head">
        <h2>{list.title}</h2>
        <span className="muted">
          {list.entries.length} {list.entries.length === 1 ? 'word' : 'words'}
        </span>
        <svg className="chevron" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {list.description && <p className="muted">{list.description}</p>}
      {list.translationLang && list.entries.length > 0 && (
        <p className="cheat-legend muted">
          <span className="cheat-word">English</span> ·{' '}
          <span className="cheat-translation">{list.translationLang.label}</span>
        </p>
      )}
      {hasMeanings && (
        <p className="cheat-hint muted">
          Tap an English word to choose the meaning you mean; its translation follows. Tap a translation for other
          options and examples, and star the one you like best.
        </p>
      )}
      {list.entries.length > 0 ? (
        <ol className="cheat-grid">
          {list.entries.map((entry, i) => (
            <Row
              key={entry.word}
              rank={i + 1}
              entry={entry}
              list={list}
              picks={picks}
              setPick={setPick}
              onRemove={onRemoveEntry && (() => onRemoveEntry(entry.word))}
            />
          ))}
        </ol>
      ) : (
        <p className="muted empty-list">No words yet. Add your first one below.</p>
      )}
      {list.attribution && <p className="attribution muted">{list.attribution}</p>}
      {children}
    </details>
  )
}

type RowProps = {
  rank: number
  entry: CheatsheetEntry
  list: CheatsheetList
  picks: Picks
  setPick: (key: string, value: string | null) => void
  onRemove?: () => void
}

// One word: the English word (its chosen meaning) and the translation for that meaning.
function Row({ rank, entry, list, picks, setPick, onRemove }: RowProps) {
  const mKey = meaningKey(list.id, entry.word)
  // The default meaning is the first one with a translation. A saved pick that no longer exists (data
  // regenerated) falls back to it.
  const defaultMeaning = entry.meanings.find((m) => m.options.length) ?? entry.meanings[0]
  const meaning = entry.meanings.find((m) => m.id === picks[mKey]) ?? defaultMeaning
  const oKey = optionKey(list.id, entry.word, meaning?.id ?? '')
  const lang = list.translationLang?.code

  return (
    <li>
      <span className="rank">{rank}</span>
      <WordCell
        entry={entry}
        meaning={meaning}
        defaultId={defaultMeaning?.id}
        // Picking the default clears the saved pick, so the default can change when the data does.
        onPick={(m) => setPick(mKey, m.id === defaultMeaning?.id ? null : m.id)}
      />
      {meaning ? (
        <TranslationCell
          word={entry.word}
          meaning={meaning}
          lang={lang}
          langLabel={list.translationLang?.label}
          pickedText={picks[oKey]}
          onPick={(text, isDefault) => setPick(oKey, isDefault ? null : text)}
        />
      ) : (
        // Not in the dictionary at all (e.g. "going to").
        <span className="cheat-translation cheat-trans-wrap" title="Not found in the dictionary">
          —
        </span>
      )}
      {onRemove && (
        <button type="button" className="remove-word" aria-label={`Remove “${entry.word}”`} onClick={onRemove}>
          ✕
        </button>
      )}
    </li>
  )
}

// Short part-of-speech labels for the list, e.g. "adj" for "Adjective".
const POS_ABBR: Record<string, string> = {
  noun: 'n.', verb: 'v.', adj: 'adj.', adv: 'adv.', pron: 'pron.', det: 'det.', article: 'art.', prep: 'prep.',
  conj: 'conj.', intj: 'interj.', particle: 'part.', num: 'num.', contraction: 'contr.', phrase: 'phr.',
  prep_phrase: 'phr.', name: 'n.',
}

type WordCellProps = { entry: CheatsheetEntry; meaning?: Meaning; defaultId?: string; onPick: (m: Meaning) => void }

function WordCell({ entry, meaning, defaultId, onPick }: WordCellProps) {
  const abbr = meaning?.pos ? (POS_ABBR[meaning.pos] ?? meaning.pos) : null
  // Custom words have a single meaning with no part of speech: nothing to choose.
  if (!meaning || (entry.meanings.length < 2 && !meaning.pos)) return <span className="cheat-word">{entry.word}</span>

  const count = entry.meanings.length
  return (
    <Popover
      title={entry.word}
      align="start"
      wrapClassName="cheat-word-wrap"
      triggerClassName="cheat-word word-trigger"
      triggerLabel={`${entry.word}, ${meaning.posName ?? ''}: ${meaning.gloss ?? ''}${count > 1 ? `. ${count} meanings` : ''}`}
      contentKey={meaning.id}
      trigger={
        <>
          {entry.word}
          {abbr && (
            <span className="pos-tag" aria-hidden="true">
              {abbr}
            </span>
          )}
        </>
      }
    >
      <div className="tip-options" role="group" aria-label={`Meanings of “${entry.word}”`}>
        <p className="tip-note-label">
          {count > 1 ? `Which meaning? (${count})` : 'Meaning'}
        </p>
        <ul>
          {entry.meanings.map((m) => {
            const isPicked = m.id === meaning.id
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={isPicked ? 'tip-option meaning-option picked' : 'tip-option meaning-option'}
                  aria-pressed={isPicked}
                  onClick={() => onPick(m)}
                >
                  <span className="star" aria-hidden="true">
                    {isPicked ? '★' : '☆'}
                  </span>
                  <span className="pos-name">{m.posName ?? m.pos}</span>
                  <span className="tip-option-usage">
                    <span className="meaning-gloss">{m.gloss}</span>
                    {m.labels?.length ? <span className="label-chips"> {m.labels.join(', ')}</span> : null}
                    {m.example && <span className="meaning-example">“{m.example}”</span>}
                    {m.options.length === 0 && <span className="meaning-example">No translation found</span>}
                  </span>
                  {m.id === defaultId && <span className="default-tag">default</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Popover>
  )
}

type TranslationCellProps = {
  word: string
  meaning: Meaning
  lang?: string
  langLabel?: string
  // Text of the option the user starred for this meaning, if any.
  pickedText?: string
  onPick: (text: string, isDefault: boolean) => void
}

// The translation for the chosen meaning, with a box listing the other options and an example.
function TranslationCell({ word, meaning, lang, langLabel, pickedText, onPick }: TranslationCellProps) {
  const { options } = meaning
  const found = options.findIndex((o) => o.text === pickedText)
  const pickedIndex = found >= 0 ? found : 0
  const picked = options[pickedIndex]
  const extra = options.length - 1

  // A custom word: just the user's translation.
  if (!meaning.pos && options.length === 1 && !picked.gloss) {
    return (
      <span className="cheat-translation cheat-trans-wrap" lang={lang}>
        {picked.text}
      </span>
    )
  }

  const meaningLine = meaning.gloss && (
    <p className="tip-meaning">
      <span className="pos-name">{meaning.posName ?? meaning.pos}</span> {meaning.gloss}
    </p>
  )

  return (
    <Popover
      title={word}
      wrapClassName="cheat-trans-wrap"
      triggerClassName="cheat-translation"
      lang={picked ? lang : undefined}
      contentKey={`${meaning.id}|${pickedIndex}`}
      triggerLabel={
        picked
          ? extra > 0
            ? `${picked.text}, ${extra} more ${extra === 1 ? 'option' : 'options'}`
            : undefined
          : `No translation for this meaning of ${word}`
      }
      trigger={
        picked ? (
          <>
            {picked.text}
            {extra > 0 && (
              <span className="more-tag" aria-hidden="true">
                +{extra}
              </span>
            )}
          </>
        ) : (
          '—'
        )
      }
    >
      {meaningLine}
      {picked ? (
        <>
          <div className="tip-options" role="group" aria-label={`Translations of “${word}”`}>
            <p className="tip-note-label">{options.length > 1 ? 'Star the one to show in the list' : 'Translation'}</p>
            <ul>
              {options.map((option, i) => {
                const isPicked = i === pickedIndex
                return (
                  <li key={option.text}>
                    <button
                      type="button"
                      className={isPicked ? 'tip-option picked' : 'tip-option'}
                      aria-pressed={isPicked}
                      onClick={() => onPick(option.text, i === 0)}
                    >
                      <span className="star" aria-hidden="true">
                        {isPicked ? '★' : '☆'}
                      </span>
                      <span className="tip-option-text" lang={lang}>
                        {option.text}
                      </span>
                      <span className="tip-option-usage">
                        {option.gloss}
                        {option.regions?.length ? <span className="region-badge"> {option.regions.join(', ')}</span> : null}
                        {option.labels?.length ? <span className="label-chips"> {option.labels.join(', ')}</span> : null}
                      </span>
                      {i === 0 && <span className="default-tag">default</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          {picked.example && (
            <div className="tip-example">
              <p className="tip-translated" lang={lang}>
                {picked.example.text}
              </p>
              {picked.example.translation && <p className="tip-en">{picked.example.translation}</p>}
            </div>
          )}
        </>
      ) : (
        <div className="tip-note">
          <p className="tip-note-label">No translation found</p>
          <p>
            The dictionary has no {langLabel ?? 'translation'} word for this meaning of “{word}”. Grammar words often
            have no direct equivalent. Try another meaning by tapping the English word.
          </p>
        </div>
      )}
    </Popover>
  )
}

function NewListForm({ onCreate, onCancel }: { onCreate: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) onCreate(title.trim())
  }

  return (
    <form className="card new-list-form" onSubmit={submit}>
      <label htmlFor="new-list-title" className="form-label">
        Name your new list
      </label>
      <div className="form-row">
        <input
          id="new-list-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          placeholder="e.g. Food words, Things I say at work"
          maxLength={60}
          // The form only appears after pressing "Add a new list", so focusing it is expected.
          autoFocus
        />
        <button type="submit" className="primary" disabled={!title.trim()}>
          Create
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

type CustomListControlsProps = {
  list: CustomList
  onAdd: (entry: CustomEntry) => void
  onDelete: () => void
}

// Under a custom list's words: a form to add a word, and a button to delete the list.
function CustomListControls({ list, onAdd, onDelete }: CustomListControlsProps) {
  const [word, setWord] = useState('')
  const [translation, setTranslation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const wordRef = useRef<HTMLInputElement>(null)
  const formId = useId()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const w = word.trim()
    const t = translation.trim()
    if (!w || !t) return
    // Words identify entries (React keys, removal), so each can appear once per list.
    if (list.entries.some((entry) => entry.word.toLowerCase() === w.toLowerCase())) {
      setError(`“${w}” is already in this list.`)
      return
    }
    onAdd({ word: w, translation: t })
    setWord('')
    setTranslation('')
    setError(null)
    wordRef.current?.focus()
  }

  const confirmDelete = () => {
    const count = list.entries.length
    const message =
      count > 0
        ? `Delete “${list.title}” and its ${count} ${count === 1 ? 'word' : 'words'}?`
        : `Delete “${list.title}”?`
    if (window.confirm(message)) onDelete()
  }

  return (
    <div className="custom-controls">
      <form className="add-word-form" onSubmit={submit} aria-label={`Add a word to ${list.title}`}>
        <div className="form-row">
          <input
            ref={wordRef}
            id={`${formId}-word`}
            aria-label="English word"
            value={word}
            onChange={(e) => {
              setWord(e.target.value)
              setError(null)
            }}
            placeholder="English word"
            autoCapitalize="off"
            maxLength={60}
          />
          <input
            aria-label="Southern Vietnamese translation"
            lang="vi"
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            placeholder="Translation"
            autoCapitalize="off"
            maxLength={80}
          />
          <button type="submit" className="primary" disabled={!word.trim() || !translation.trim()}>
            Add
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
      <button type="button" className="link danger-link" onClick={confirmDelete}>
        Delete list
      </button>
    </div>
  )
}
