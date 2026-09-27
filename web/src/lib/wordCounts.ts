export type WordCount = {
  word: string
  count: number
  // True when the word came from FALLBACK_WORDS rather than the user's answers.
  suggested: boolean
}

// Used to top up the list when the user's answers have fewer than `limit` distinct words.
export const FALLBACK_WORDS = [
  'I', 'You', 'He', 'She', 'We', 'They', 'This', 'That', 'Who', 'What',
  'Person', 'Man', 'Woman', 'Friend', 'People',
  'Be', 'Have', 'Do', 'Make', 'Say', 'Tell', 'Get', 'Take', 'Go', 'Come', 'Know', 'See', 'Look',
  'Think', 'Want', 'Give', 'Use', 'Find', 'Ask', 'Work', 'Seem', 'Feel', 'Try', 'Leave', 'Call',
  'Eat', 'Drink', 'Sleep', 'Buy', 'Pay',
  'Time', 'Year', 'Day', 'Week', 'Now', 'Then', 'Before', 'After', 'Today', 'Always', 'Never',
  'Where', 'Here', 'There', 'Up', 'Down', 'In', 'Out', 'On', 'Off', 'Over', 'Under', 'Far', 'Near',
  'Good', 'Bad', 'Big', 'Small', 'New', 'Old', 'Hot', 'Cold', 'Fast', 'Slow', 'Happy', 'Sad',
  'Right', 'Wrong', 'More', 'Less', 'All', 'Some', 'Other', 'Same', 'Different',
  'And', 'But', 'Or', 'Because', 'If', 'With', 'Without', 'For', 'From', 'About',
]

function normalizeApostrophes(text: string): string {
  return text.replace(/[\u2018\u2019]/g, "'")
}

// Letters/digits, allowing inner apostrophes so "don't" and "I'm" stay one word.
const WORD_PATTERN = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu

export function tokenize(text: string): string[] {
  return normalizeApostrophes(text).toLowerCase().match(WORD_PATTERN) ?? []
}

export function displayWord(word: string): string {
  return word === 'i' ? 'I' : word.replace(/^i'/, "I'")
}

export function topWords(texts: string[], limit = 100): WordCount[] {
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const word of tokenize(text)) {
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  const words: WordCount[] = [...counts]
    .map(([word, count]) => ({ word, count, suggested: false }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit)

  const seen = new Set(words.map((w) => w.word))
  for (const fallback of FALLBACK_WORDS) {
    if (words.length >= limit) break
    const word = fallback.toLowerCase()
    if (seen.has(word)) continue
    seen.add(word)
    words.push({ word, count: 0, suggested: true })
  }
  return words
}
