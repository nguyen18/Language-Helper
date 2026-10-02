// The journal's display font, Space Grotesk (a bold geometric face, as in zine-style journals), loaded from
// Google Fonts the first time the journal opens, so other pages don't download it. Until it arrives (or
// offline), headings fall back to the system font.

const HREF = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap'

export function loadJournalFont() {
  if (typeof document === 'undefined' || document.querySelector(`link[href="${HREF}"]`)) return
  for (const [rel, href, cross] of [
    ['preconnect', 'https://fonts.googleapis.com', false],
    ['preconnect', 'https://fonts.gstatic.com', true],
    ['stylesheet', HREF, false],
  ] as const) {
    const link = document.createElement('link')
    link.rel = rel
    link.href = href
    if (cross) link.crossOrigin = ''
    document.head.appendChild(link)
  }
}
