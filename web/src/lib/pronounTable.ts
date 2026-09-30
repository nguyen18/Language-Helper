// Vietnamese "I" and "you" depend on who you're talking to, and come as a pair: say "em" and you call
// the other person "anh" or "chị". The Cheatsheet shows the pronoun words (I, me, my, you, your, and
// contractions with "I") as a "who are you talking to?" table instead of a ranked list.
//
// SCAFFOLDING (2026-09-30): DRAFT_PRONOUN_TABLE is hand-written placeholder data so the table can be
// built and tested. The real table will come from which-dialect (relationship tags read from Wiktionary's
// definitions) once it ranks pronouns correctly; the owner is fixing that separately. Then
// scripts/build-cheatsheet.ts should write `pronounTable` into public/cheatsheet/top-100.json, and the
// page uses that instead of this draft (see pronounTableFor in pages/Cheatsheet.tsx).

export type PronounRow = {
  // Stable id: the user's pick is saved by it.
  id: string
  // Who you're talking to, in English.
  who: string
  // What you call yourself ("I"/"me") and them ("you"), most usual first.
  i: string[]
  you: string[]
  // Short usage note, e.g. a warning or a dialect difference.
  note?: string
}

export type PronounTable = {
  rows: PronounRow[]
  // The row used until the user picks one.
  defaultId: string
  // 'draft' for the placeholder below; the generated table will say where it came from.
  source: 'draft' | 'which-dialect'
}

export const DRAFT_PRONOUN_TABLE: PronounTable = {
  source: 'draft',
  defaultId: 'friend',
  rows: [
    { id: 'friend', who: 'A friend your age', i: ['tui', 'mình'], you: ['bạn'] },
    { id: 'close-friend', who: 'A close friend (very casual)', i: ['tao'], you: ['mày'], note: 'Rude with anyone else' },
    { id: 'older-man', who: 'Someone a bit older (man)', i: ['em'], you: ['anh'] },
    { id: 'older-woman', who: 'Someone a bit older (woman)', i: ['em'], you: ['chị'] },
    { id: 'younger', who: 'Someone younger', i: ['anh', 'chị'], you: ['em'], note: 'anh if you’re a man, chị if a woman' },
    { id: 'parents', who: 'Your parents', i: ['con'], you: ['ba', 'má'], note: 'Southern; Northern: bố / mẹ' },
    { id: 'parents-age', who: 'An older adult (your parents’ age)', i: ['con', 'cháu'], you: ['cô', 'chú'], note: 'cô for a woman, chú for a man' },
    { id: 'grandparents-age', who: 'Grandparents’ age', i: ['con', 'cháu'], you: ['ông', 'bà'], note: 'ông for a man, bà for a woman' },
    { id: 'teacher', who: 'Your teacher', i: ['em'], you: ['thầy', 'cô'], note: 'thầy for a man, cô for a woman' },
    { id: 'partner', who: 'Your partner', i: ['anh', 'em'], you: ['em', 'anh'], note: 'The older one is anh' },
    { id: 'formal', who: 'A stranger, formal, or at work', i: ['tôi'], you: ['anh', 'chị', 'bạn'] },
  ],
}

// Which list words the table applies to, and what each shows: the "I" word, the "you" word, or
// "của" + one of them for the possessives ("my" → "của tui").
export type PronounRole = 'i' | 'you' | 'my' | 'your'
const ROLES: Record<string, PronounRole> = { i: 'i', me: 'i', my: 'my', you: 'you', your: 'your' }

export function pronounRole(word: string): PronounRole | undefined {
  return ROLES[word.toLowerCase()]
}

/** The translation a pronoun word shows for a table row ("my" + friend → "của tui"). */
export function pronounText(role: PronounRole, row: PronounRow): string {
  switch (role) {
    case 'i':
      return row.i[0]
    case 'you':
      return row.you[0]
    case 'my':
      return `của ${row.i[0]}`
    case 'your':
      return `của ${row.you[0]}`
  }
}
