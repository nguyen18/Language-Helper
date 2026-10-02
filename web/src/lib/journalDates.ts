// An entry's date and week, written in the language being learned, for the journal's date row and weekday
// strip ("Thứ Năm, 1 tháng 10, 2026"; "T2 T3 T4 T5 T6 T7 CN"). Uses the browser's Intl formatting, so it
// works for any language the browser knows, with no data of our own.

type IntlLocaleWithWeek = Intl.Locale & {
  getWeekInfo?: () => { firstDay: number }
  weekInfo?: { firstDay: number }
}

// The day the week starts on in the language's main region, as Date.getDay() numbers (0 = Sunday).
// Intl's firstDay is 1 = Monday … 7 = Sunday; browsers without week info start on Sunday.
function firstDayOfWeek(lang: string): number {
  try {
    const locale = new Intl.Locale(lang).maximize() as IntlLocaleWithWeek
    const first = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? 7
    return first % 7
  } catch {
    return 0
  }
}

export type EntryDate = {
  /** "Thứ Năm, 1 tháng 10, 2026" */
  date: string
  /** "21:30" or "9:30 PM", as the language writes times. */
  time: string
  /** The entry's week, in order, with the entry's own day marked. */
  week: { label: string; long: string; today: boolean }[]
  /** The same date in English, for a learner who can't read it yet. */
  english: string
}

/** `when` is a datetime-local value ("2026-10-01T21:30"); `lang` the language's code ("vi"). */
export function entryDate(when: string, lang: string): EntryDate {
  const day = new Date(when)
  const format = (locale: string, options: Intl.DateTimeFormatOptions) => {
    try {
      return day.toLocaleString(locale, options)
    } catch {
      return day.toLocaleString('en', options)
    }
  }
  const start = new Date(day)
  start.setDate(day.getDate() - ((day.getDay() - firstDayOfWeek(lang) + 7) % 7))
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return {
      label: d.toLocaleString(lang, { weekday: 'short' }),
      long: d.toLocaleString(lang, { weekday: 'long' }),
      today: d.toDateString() === day.toDateString(),
    }
  })
  return {
    date: format(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: format(lang, { hour: 'numeric', minute: '2-digit' }),
    week,
    english: format('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  }
}
