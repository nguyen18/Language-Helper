// Vietnamese pronouns depend on who you're talking to (or about), and come in pairs: say "em" and you
// call the other person "anh" or "chị". The Cheatsheet shows the pronoun words (I, me, my, you, your,
// we, she, her, him, they, them, and contractions with "I") as a "who are you talking to?" table
// instead of a ranked list.
//
// The table comes from which-dialect (dictionary.pronouns(), Southern), written into the generated data
// by scripts/build-cheatsheet.ts. (A hand-written draft was used from 2026-09-30 until which-dialect's
// pronoun table was published the same day.)

export type PronounColumn = 'self' | 'addressee' | 'third' | 'selfPlural' | 'addresseePlural' | 'thirdPlural'

export type PronounCell = {
  word: string
  // Only when you're a man or a woman ("anh" if you're a man, "chị" if a woman, toward someone younger).
  speaker?: 'male' | 'female'
  // The gender of the person the word refers to ("ảnh" he, "chỉ" she).
  gender?: 'male' | 'female'
  // For "we": whether it includes the person you're talking to ("chúng ta") or not ("chúng tôi").
  inclusive?: boolean
  labels?: string[]
}

export type PronounRow = {
  // Stable id from which-dialect ("friend", "older-male", …): the user's pick is saved by it.
  id: string
  // Who you're talking to (or about): "Your parents".
  who: string
  warning?: string
  cells: Partial<Record<PronounColumn, PronounCell[]>>
}

export type PronounTable = {
  rows: PronounRow[]
  // Row used until the user picks who they're talking to, and who they're talking about.
  defaultListener: string
  defaultAbout: string
  source: 'which-dialect'
}

export type Speaker = 'male' | 'female'

// What a pronoun word shows: which column, whether it's a possessive ("my" → "của tui"), the gender it
// refers to (she/her vs he/him), and whether the relationship is with the listener or the person talked about.
export type PronounRole = {
  column: PronounColumn
  possessive?: boolean
  gender?: 'male' | 'female'
  relation: 'listener' | 'about'
}

const ROLES: Record<string, PronounRole> = {
  i: { column: 'self', relation: 'listener' },
  me: { column: 'self', relation: 'listener' },
  my: { column: 'self', possessive: true, relation: 'listener' },
  you: { column: 'addressee', relation: 'listener' },
  your: { column: 'addressee', possessive: true, relation: 'listener' },
  we: { column: 'selfPlural', relation: 'listener' },
  us: { column: 'selfPlural', relation: 'listener' },
  our: { column: 'selfPlural', possessive: true, relation: 'listener' },
  he: { column: 'third', gender: 'male', relation: 'about' },
  him: { column: 'third', gender: 'male', relation: 'about' },
  his: { column: 'third', gender: 'male', possessive: true, relation: 'about' },
  she: { column: 'third', gender: 'female', relation: 'about' },
  her: { column: 'third', gender: 'female', relation: 'about' },
  they: { column: 'thirdPlural', relation: 'about' },
  them: { column: 'thirdPlural', relation: 'about' },
  their: { column: 'thirdPlural', possessive: true, relation: 'about' },
}

export function pronounRole(word: string): PronounRole | undefined {
  return ROLES[word.toLowerCase()]
}

// Columns that belong together. The Cheatsheet uses these pairs for talking-about tables (he·she/they);
// talking-to tables show a single column (see PronounTableView).
export const COLUMN_GROUPS: Record<PronounColumn, [PronounColumn, PronounColumn]> = {
  self: ['self', 'addressee'],
  addressee: ['self', 'addressee'],
  selfPlural: ['selfPlural', 'addresseePlural'],
  addresseePlural: ['selfPlural', 'addresseePlural'],
  third: ['third', 'thirdPlural'],
  thirdPlural: ['third', 'thirdPlural'],
}

export const COLUMN_LABELS: Record<PronounColumn, string> = {
  self: '“I”',
  addressee: '“you”',
  third: '“he/she”',
  selfPlural: '“we”',
  addresseePlural: '“you” (plural)',
  thirdPlural: '“they”',
}

/**
 * A cell's words for display: speaker-specific words left out when the speaker is set and doesn't match,
 * and words of the wrong gender left out when `gender` is given (unless nothing else is left).
 */
export function cellChoices(row: PronounRow, column: PronounColumn, speaker?: Speaker, gender?: 'male' | 'female'): PronounCell[] {
  let cells = (row.cells[column] ?? []).filter((c) => !speaker || !c.speaker || c.speaker === speaker)
  if (gender) {
    const matching = cells.filter((c) => !c.gender || c.gender === gender)
    if (matching.length) cells = matching
  }
  return cells
}

/** The word a pronoun shows for a row ("my" + friend → "của mình"), or undefined when the cell is empty. */
export function pronounText(role: PronounRole, row: PronounRow, speaker?: Speaker): string | undefined {
  const [first] = cellChoices(row, role.column, speaker, role.gender)
  if (!first) return undefined
  return role.possessive ? `của ${first.word}` : first.word
}

/**
 * The word for the picked row, or, when that row has no word for this pronoun (e.g. "they" about
 * grandparents), the table's default row's: a neutral word ("họ"), never the dictionary's first
 * translation, which can be rude ("tụi nó").
 */
export function pronounTextOrDefault(role: PronounRole, row: PronounRow, table: PronounTable, speaker?: Speaker): string | undefined {
  const fallbackId = role.relation === 'listener' ? table.defaultListener : table.defaultAbout
  const neutral = table.rows.find((r) => r.id === fallbackId)
  return pronounText(role, row, speaker) ?? (neutral ? pronounText(role, neutral, speaker) : undefined)
}
