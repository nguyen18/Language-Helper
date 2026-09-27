import { CHEATSHEET_LISTS } from '../lib/cheatsheet'

export function Cheatsheet() {
  return (
    <main className="app">
      <header className="header">
        <h1>Cheatsheet</h1>
        <p className="muted">Handy word lists to keep nearby while you learn.</p>
      </header>

      {CHEATSHEET_LISTS.map((list) => (
        // Native <details>: collapsible with keyboard and screen reader support; the summary (title) stays visible.
        <details key={list.id} className="card cheat-list" open>
          <summary className="card-head">
            <h2>{list.title}</h2>
            <span className="muted">{list.entries.length} words</span>
            <svg className="chevron" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p className="muted">{list.description}</p>
          {list.translationLang && (
            <p className="cheat-legend muted">
              <span className="cheat-word">English</span> ·{' '}
              <span className="cheat-translation">{list.translationLang.label}</span>
            </p>
          )}
          <ol className="cheat-grid">
            {list.entries.map(({ word, translation }, i) => (
              <li key={word}>
                <span className="rank">{i + 1}</span>
                <span className="cheat-word">{word}</span>
                {translation && (
                  <span className="cheat-translation" lang={list.translationLang?.code}>
                    {translation}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </main>
  )
}
