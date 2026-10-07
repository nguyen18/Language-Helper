// Before 2026-10-07's rename, the app was "Language Helper" and its localStorage keys started with
// `language-helper:`. Moves them to `mai-tutor:`, keeping any value already saved under the new name.
// main.tsx imports this first, so it runs before any module reads its key. (The journal's IndexedDB
// database moves in journal.ts.)
const OLD_PREFIX = 'language-helper:'
const NEW_PREFIX = 'mai-tutor:'

try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(OLD_PREFIX)) continue
    const newKey = NEW_PREFIX + key.slice(OLD_PREFIX.length)
    if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, localStorage.getItem(key)!)
    localStorage.removeItem(key)
  }
} catch {
  // No localStorage here (blocked, or full): the old keys stay and the next load tries again.
}
