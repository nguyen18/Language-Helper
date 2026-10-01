import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Discoverer } from './pages/Discoverer'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'
import { ROUTE_HREF, useRoute, type Route } from './lib/useRoute'
import { ErrorBoundary } from './components/ErrorBoundary'
import './App.css'

// The Cheatsheet carries ~100 KB of dictionary data, so it loads only when opened.
const Cheatsheet = lazy(() => import('./pages/Cheatsheet').then((m) => ({ default: m.Cheatsheet })))
// The journal (editor, stickers, audio) loads only when opened, too.
const Journal = lazy(() => import('./pages/Journal').then((m) => ({ default: m.Journal })))

const MENU_ITEMS: { route: Route; label: string }[] = [
  { route: 'home', label: 'Home' },
  { route: 'cheatsheet', label: 'Cheatsheet' },
  { route: 'journal', label: 'Journal' },
  { route: 'settings', label: 'Settings' },
]

// Planned features from NOTES.md, shown in the menu so the app's direction is visible.
const COMING_SOON = ['Personal phrasebook', 'Feelings map', 'Flashcards']

function App() {
  const route = useRoute()

  // Pages start at the top, except the Discoverer, which scrolls itself to the latest message.
  useEffect(() => {
    if (route !== 'discover') window.scrollTo(0, 0)
  }, [route])

  return (
    <>
      {/* Keyed by route so the menu starts closed on every page, including after Back. */}
      <SiteHeader key={route} route={route} />
      {route === 'discover' ? (
        <Discoverer />
      ) : route === 'cheatsheet' ? (
        <ErrorBoundary message="Couldn't load the cheatsheet. Check your connection and try again.">
          <Suspense fallback={<main className="app"><p className="muted">Loading the cheatsheet…</p></main>}>
            <Cheatsheet />
          </Suspense>
        </ErrorBoundary>
      ) : route === 'journal' ? (
        <ErrorBoundary message="Couldn't load the journal. Check your connection and try again.">
          <Suspense fallback={<main className="app"><p className="muted">Loading your journal…</p></main>}>
            <Journal />
          </Suspense>
        </ErrorBoundary>
      ) : route === 'settings' ? (
        <Settings />
      ) : (
        <Home />
      )}
    </>
  )
}

function SiteHeader({ route }: { route: Route }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the menu on Escape or on a click outside it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div className="site-header">
      <a className="brand" href={ROUTE_HREF.home}>
        ✦ Language Helper ✦
      </a>
      <div className="menu" ref={menuRef}>
        <button type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}>
          {open ? '✕ Close' : '☰ Menu'}
        </button>
        {open && (
          <nav id="site-menu" className="menu-panel">
            {MENU_ITEMS.map((item) => (
              <a
                key={item.route}
                href={ROUTE_HREF[item.route]}
                aria-current={item.route === route ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <p className="menu-heading">Coming soon</p>
            {COMING_SOON.map((label) => (
              <span key={label} className="menu-soon">
                {label}
              </span>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}

export default App
