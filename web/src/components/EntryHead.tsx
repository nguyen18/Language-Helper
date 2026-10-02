import type { ReactNode } from 'react'
import type { EntryDate } from '../lib/journalDates'

// A journal page's header, like a zine page's: a bordered "Date" row in the language being learned (the
// English on hover), and the week with the entry's day circled. The editor puts its date picker in the row.

type EntryHeadProps = {
  when: string
  date: EntryDate
  /** The entry's language, shown only when it isn't the one being learned now. */
  label?: string
  lang: string
  /** In place of the written-out date: the editor's date picker. */
  children?: ReactNode
}

export function EntryHead({ when, date, label, lang, children }: EntryHeadProps) {
  return (
    <div className="entry-head">
      <div className="entry-date-row">
        <span className="entry-date-label">Date</span>
        {children ?? (
          <time dateTime={when} className="entry-date" lang={lang} title={date.english}>
            {date.date} · {date.time}
          </time>
        )}
        {label && <span className="language-tag">{label}</span>}
      </div>
      <ol className="entry-week" aria-label="Week">
        {date.week.map((d, i) => (
          <li key={i} className={d.today ? 'today' : undefined} lang={lang} title={d.long} aria-current={d.today ? 'date' : undefined}>
            {d.label}
          </li>
        ))}
      </ol>
    </div>
  )
}
