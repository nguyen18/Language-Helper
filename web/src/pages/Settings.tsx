import { TARGET_LANGUAGES, useTargetLanguage, type TargetLanguage } from '../lib/languages'

// Dialects grouped under their language ("Vietnamese": Southern, Central, Northern).
const BY_LANGUAGE = TARGET_LANGUAGES.reduce<Map<string, TargetLanguage[]>>(
  (groups, t) => groups.set(t.language, [...(groups.get(t.language) ?? []), t]),
  new Map(),
)

export function Settings() {
  const [target, setTarget] = useTargetLanguage()

  return (
    <main className="app">
      <header className="header">
        <h1>Settings</h1>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>Language you're learning</h2>
        </div>
        <p className="muted">
          Words across the site are translated into this language. Each dialect has its own everyday words and
          pronouns.
        </p>
        {[...BY_LANGUAGE].map(([language, dialects]) => (
          <fieldset key={language} className="language-group">
            <legend>{language}</legend>
            {dialects.map((t) => (
              <label key={t.id} className={t.id === target.id ? 'language-option picked' : 'language-option'}>
                <input
                  type="radio"
                  name="target-language"
                  value={t.id}
                  checked={t.id === target.id}
                  onChange={() => setTarget(t.id)}
                />
                {t.dialect ?? t.label}
              </label>
            ))}
          </fieldset>
        ))}
        <p className="muted settings-note">
          More languages are coming as{' '}
          <a href="https://github.com/nguyen18/which-dialect" target="_blank" rel="noreferrer">
            which-dialect
          </a>{' '}
          adds them. Your custom word lists keep the language they were made in.
        </p>
      </section>
    </main>
  )
}
