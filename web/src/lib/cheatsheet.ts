export type CheatsheetEntry = {
  word: string
  // Shown next to the word in cherry red; '—' where the other language has no equivalent word.
  translation?: string
}

export type CheatsheetList = {
  id: string
  title: string
  description: string
  // Language of the translations, e.g. for the lang attribute and the legend.
  translationLang?: { code: string; label: string }
  // Most common first; the page shows each word's rank.
  entries: CheatsheetEntry[]
}

const pairs = (list: [string, string][]): CheatsheetEntry[] =>
  list.map(([word, translation]) => ({ word, translation }))

// Reference lists shown on the Cheatsheet page. Add new lists here; each gets its own section.
export const CHEATSHEET_LISTS: CheatsheetList[] = [
  {
    id: 'top-100',
    title: '100 most common words',
    description: 'Everyday words, ranked from most to least common, with a casual Southern Vietnamese equivalent.',
    translationLang: { code: 'vi', label: 'Southern Vietnamese' },
    // English words supplied by the project owner (from top_100_words.txt). Keep the order and spellings as given.
    // Translations are casual Southern Vietnamese (tui, hông, thiệt, ừa…), one common equivalent per word;
    // English grammar words often have no direct match, so these are approximations. '—' = no word needed.
    entries: pairs([
      ['i', 'tui'],
      ['you', 'bạn'],
      ['to', 'tới'],
      ['the', '—'],
      ['and', 'với'],
      ['a', 'một'],
      ['it', 'nó'],
      ['like', 'kiểu'],
      ['so', 'nên'],
      ['yeah', 'ừa'],
      ['is', 'là'],
      ['but', 'mà'],
      ['im', 'tui là'],
      ['just', 'chỉ'],
      ['we', 'tụi mình'],
      ['for', 'cho'],
      ['that', 'đó'],
      ['its', 'nó là'],
      ['was', 'đã'],
      ['ok', 'oke'],
      ['in', 'trong'],
      ['me', 'tui'],
      ['are', 'là'],
      ['my', 'của tui'],
      ['can', 'được'],
      ['think', 'nghĩ'],
      ['if', 'nếu'],
      ['do', 'làm'],
      ['oh', 'ồ'],
      ['have', 'có'],
      ['be', 'là'],
      ['of', 'của'],
      ['what', 'gì'],
      ['thats', 'đó là'],
      ['at', 'ở'],
      ['your', 'của bạn'],
      ['good', 'tốt'],
      ['on', 'trên'],
      ['not', 'hông'],
      ['she', 'cổ'],
      ['with', 'với'],
      ['up', 'lên'],
      ['this', 'này'],
      ['too', 'cũng'],
      ['or', 'hay'],
      ['get', 'lấy'],
      ['go', 'đi'],
      ['dont', 'hông'],
      ['they', 'tụi nó'],
      ['see', 'thấy'],
      ['no', 'hông'],
      ['sorry', 'xin lỗi'],
      ['one', 'một'],
      ['out', 'ra'],
      ['know', 'biết'],
      ['did', 'đã'],
      ['her', 'cổ'],
      ['wait', 'chờ'],
      ['how', 'sao'],
      ['gonna', 'sẽ'],
      ['sure', 'chắc'],
      ['really', 'thiệt'],
      ['ill', 'tui sẽ'],
      ['about', 'về'],
      ['all', 'hết'],
      ['also', 'cũng'],
      ['want', 'muốn'],
      ['when', 'khi'],
      ['maybe', 'chắc'],
      ['then', 'rồi'],
      ['got', 'có'],
      ['there', 'đó'],
      ['going', 'đi'],
      ['him', 'ảnh'],
      ['thanks', 'cám ơn'],
      ['should', 'nên'],
      ['tho', 'mà'],
      ['back', 'về'],
      ['cool', 'ngầu'],
      ['will', 'sẽ'],
      ['didnt', 'hông có'],
      ['still', 'vẫn'],
      ['some', 'vài'],
      ['need', 'cần'],
      ['why', 'sao'],
      ['kinda', 'hơi'],
      ['something', 'cái gì đó'],
      ['would', 'sẽ'],
      ['yes', 'dạ'],
      ['wanna', 'muốn'],
      ['feel', 'thấy'],
      ['come', 'tới'],
      ['them', 'tụi nó'],
      ['from', 'từ'],
      ['were', 'đã'],
      ['now', 'giờ'],
      ['said', 'nói'],
      ['actually', 'thiệt ra'],
      ['been', 'từng'],
      ['much', 'nhiều'],
    ]),
  },
]
