// Copies which-dialect's dictionary data into Supabase Storage, where the `translate` and `check-grammar`
// functions read it.
//
//   npm run mirror-data                  (from web/; to the local Supabase started with `npx supabase start`)
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run mirror-data      (to a hosted project)
//
// Why: the function translates words the pre-built Cheatsheet files don't have. Loading the data from
// the jsDelivr CDN made that ~20 s per word, because files nobody had asked for recently take ~1 s each
// and a word needs dozens of them in a row. From Storage, next to the function, every file is fast.
//
// The data comes from the published npm packages (which-dialect-en / -vi, the versions below) and goes
// to the public bucket `which-dialect` as <folder>/<lang>/<path>. Already-uploaded files are skipped
// (upsert: false), so an interrupted run can just be started again. Run it again when a function's
// which-dialect version changes (DATA_SETS here and VERSION / DATA in that function).

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Each function reads its data from a folder named after the which-dialect version it imports:
// `translate` uses 0.1.1 (en + vi 0.1.1); `check-grammar` uses 0.3.0, whose journal review needs vi 0.1.3
// (checker settings, syllables and sentence frames), and reads English from 0.1.1, which is unchanged, so it
// isn't copied twice.
const DATA_SETS: { folder: string; lang: string; version: string }[] = [
  { folder: '0.1.1', lang: 'en', version: '0.1.1' },
  { folder: '0.1.1', lang: 'vi', version: '0.1.1' },
  { folder: '0.3.0', lang: 'vi', version: '0.1.3' },
]
const BUCKET = 'which-dialect'
const PARALLEL = 24

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(WEB, 'node_modules', '.cache', 'which-dialect-data')

// The local Supabase's URL and secret key, unless given.
function connection() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }
  }
  const status = JSON.parse(
    execFileSync('npx', ['-y', 'supabase@2.119.0', 'status', '-o', 'json', '--workdir', join(WEB, '..')], { encoding: 'utf8' }),
  )
  return { url: status.API_URL as string, key: status.SECRET_KEY as string }
}

// Downloads and unpacks which-dialect-<lang>@<version> once; returns its data folder.
function packageData(lang: string, version: string): string {
  const dir = join(CACHE, version, lang)
  if (!existsSync(join(dir, 'package', 'data'))) {
    execFileSync('mkdir', ['-p', dir])
    console.log(`Downloading which-dialect-${lang}@${version}`)
    const tgz = execFileSync('npm', ['pack', `which-dialect-${lang}@${version}`, '--pack-destination', dir], {
      encoding: 'utf8',
    }).trim().split('\n').pop()!
    execFileSync('tar', ['xzf', join(dir, tgz), '-C', dir])
  }
  return join(dir, 'package', 'data')
}

async function files(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await files(path)))
    else if (entry.name.endsWith('.json')) out.push(path)
  }
  return out
}

async function main() {
  const { url, key } = connection()
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  console.log(`Mirroring which-dialect data to ${url}`)

  // Public, so the function (and anyone) can read files by URL without a key; only the secret key writes.
  const bucket = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  })
  if (!bucket.ok && !(await bucket.text()).includes('already exists')) throw new Error(`Creating the bucket failed (${bucket.status})`)

  for (const { folder, lang, version } of DATA_SETS) {
    const data = packageData(lang, version)
    const paths = await files(data)
    let done = 0
    let skipped = 0
    const queue = [...paths]
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let path = queue.shift(); path; path = queue.shift()) {
          const name = `${folder}/${lang}/${relative(data, path)}`
          const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/json', 'x-upsert': 'false' },
            body: await readFile(path),
          })
          if (!res.ok) {
            const text = await res.text()
            if (res.status === 409 || text.includes('already exists') || text.includes('Duplicate')) skipped++
            else throw new Error(`Uploading ${name} failed (${res.status}): ${text}`)
          }
          if (++done % 1000 === 0) console.log(`  ${folder}/${lang}: ${done}/${paths.length}`)
        }
      }),
    )
    console.log(`${folder}/${lang} (which-dialect-${lang}@${version}): ${paths.length} files (${skipped} were already there)`)
  }
}

await mkdir(CACHE, { recursive: true })
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
