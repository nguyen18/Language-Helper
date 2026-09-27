import { useEffect, useState } from 'react'
import { STUDY_PLAN } from '../lib/studyPlan'
import { ROUTE_HREF } from '../lib/useRoute'

const STORAGE_KEY = 'language-helper:study-plan'

function loadDone(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    // Storage unavailable or corrupt; start fresh.
  }
  return []
}

export function Home() {
  const [done, setDone] = useState<string[]>(loadDone)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done))
    } catch {
      // Persistence is a convenience only.
    }
  }, [done])

  const toggle = (id: string) =>
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))

  const doneCount = STUDY_PLAN.filter((t) => done.includes(t.id)).length

  return (
    <main className="app">
      <header className="header">
        <h1>Hi, I'm Mai!</h1>
        <p className="muted">
          I'll help you learn a new language by starting with the way you already talk.
        </p>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>Your study plan from Mai</h2>
          <span className="muted">
            {doneCount} of {STUDY_PLAN.length} done
          </span>
        </div>
        <ul className="todo-list">
          {STUDY_PLAN.map((task) => {
            const checked = done.includes(task.id)
            return (
              <li key={task.id} className={checked ? 'done' : undefined}>
                <input
                  type="checkbox"
                  id={`task-${task.id}`}
                  checked={checked}
                  onChange={() => toggle(task.id)}
                />
                <div>
                  <label htmlFor={`task-${task.id}`} className="todo-text">
                    {task.text}
                  </label>
                  <p className="muted">{task.detail}</p>
                  {task.link && (
                    <a className="todo-link" href={ROUTE_HREF[task.link.route]}>
                      {task.link.label} →
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card feature">
        <p className="eyebrow">Available now</p>
        <h2>Personal Word List Discoverer</h2>
        <p className="muted">Chat with Mai and discover your top 100 most-used words.</p>
        <a className="button primary" href={ROUTE_HREF.discover}>
          Open
        </a>
      </section>
    </main>
  )
}
