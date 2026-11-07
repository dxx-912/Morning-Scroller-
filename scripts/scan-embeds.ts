/**
 * Find saved reels that only play on Instagram, before they reach the feed.
 *
 *   npm run scan -- ~/Downloads/saved-feed-backup.json
 *   npm run scan -- ~/Downloads/instagram-export.zip      (or the folder)
 *
 * Instagram decides inside its embed whether a reel plays there or shows
 * "Watch on Instagram" (often reels with licensed music). The app can't look
 * inside the embed, but a page on instagram.com can, so this opens your
 * installed Chrome in the background, not logged into anything, loads each
 * embed from instagram.com and checks.
 *
 * Writes a Saved Feed backup file that marks those reels. On your phone:
 * Settings → Restore from a backup file → Merge with my library.
 *
 * Deleted posts are only reported, not included: Instagram shows the same
 * "broken link" page when it's rate-limiting, and the app already finds
 * deleted posts on its own.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { extractSavedFromZip } from '../src/lib/exportFiles.ts'
import { makeBackup, mergeInstagramImport, readBackup } from '../src/lib/library.ts'
import { embedUrl } from '../src/lib/instagramUrl.ts'
import { isSavedExportFile, parseInstagramExport, type ExportFile } from '../src/lib/parser.ts'
import type { LibrarySnapshot, Post } from '../src/lib/types.ts'

const BATCH = 8
const BATCH_PAUSE_MS = 3000
/** Give each embed this long to show what it is. */
const SETTLE_MS = 20000
/** If this share of a batch comes back "broken", assume rate-limiting. */
const THROTTLE_SHARE = 0.5
const COOLDOWN_MS = 90_000

type Verdict = 'video' | 'watch-only' | 'photo' | 'broken' | 'timeout'

const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith('--'))
const outArg = args.find((a) => a.startsWith('--out='))?.slice(6)
/** Check only the first N posts (for a quick try). */
const limit = Number(args.find((a) => a.startsWith('--limit='))?.slice(8)) || Infinity
if (!input || !existsSync(input)) {
  console.error('Usage: npm run scan -- <Saved Feed backup .json | Instagram export .zip/folder> [--out=file.json] [--limit=N]')
  process.exit(1)
}

// ---------- read the library ----------

function loadLibrary(path: string): LibrarySnapshot {
  if (/\.json$/i.test(path)) {
    const json = JSON.parse(readFileSync(path, 'utf8'))
    if (json?.app === 'saved-feed') return readBackup(json)
  }
  const files: ExportFile[] = []
  const collect = (p: string) => {
    const st = statSync(p)
    if (st.isDirectory()) for (const f of readdirSync(p)) collect(join(p, f))
    else if (/\.zip$/i.test(p)) files.push(...extractSavedFromZip(new Uint8Array(readFileSync(p))))
    else if (isSavedExportFile(p) || p === path) files.push({ name: p, text: readFileSync(p, 'utf8') })
  }
  collect(path)
  return mergeInstagramImport({ posts: [], categories: [] }, parseInstagramExport(files), Date.now()).next
}

const lib = loadLibrary(input)
// Already-marked posts don't need checking.
const live = lib.posts.filter((p) => p.status !== 'unavailable')
const todo = live.slice(0, limit)
if (todo.length === 0) {
  console.log('Nothing to check.')
  process.exit(0)
}
console.log(`Checking ${todo.length} posts${lib.posts.length > live.length ? ` (skipping ${lib.posts.length - live.length} already marked unavailable)` : ''}…`)

// ---------- check in Chrome ----------

/**
 * Runs inside an instagram.com page, so it can read the embeds' contents.
 * Kept as plain JavaScript text: the TypeScript runner adds helpers to
 * functions that don't exist inside the browser page.
 */
const INSPECT_IN_PAGE = `async ({ urls, settleMs }) => {
  document.body.innerHTML = ''
  const frames = urls.map((src) => {
    const f = document.createElement('iframe')
    f.width = '390'
    f.height = '700'
    f.src = src
    document.body.append(f)
    return f
  })
  const classify = (f) => {
    const d = f.contentDocument
    if (!d || !d.body) return null
    if (d.querySelector('.WatchOnInstagram')) return 'watch-only'
    if (d.querySelector('video')) return 'video'
    if (/may be broken|may have been removed/i.test(d.body.innerText)) return 'broken'
    // A photo post is done once its image is in. A reel's video shows up a
    // moment after its image, so 'photo' stays provisional for a few seconds.
    if (d.querySelector('.Embed img.EmbeddedMediaImage')) return 'photo'
    return null
  }
  const verdicts = urls.map(() => null)
  const start = Date.now()
  while (Date.now() - start < settleMs) {
    await new Promise((r) => setTimeout(r, 500))
    frames.forEach((f, i) => {
      if (verdicts[i] === null || verdicts[i] === 'photo') verdicts[i] = classify(f) || verdicts[i]
    })
    const settled = verdicts.every((v) => v !== null && v !== 'photo')
    if (settled || (Date.now() - start > 8000 && verdicts.every((v) => v !== null))) break
  }
  return verdicts.map((v) => v || 'timeout')
}`

async function inspect(urls: string[]): Promise<Verdict[]> {
  return (await page.evaluate(`(${INSPECT_IN_PAGE})(${JSON.stringify({ urls, settleMs: SETTLE_MS })})`)) as Verdict[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch((err) => {
  console.error("Couldn't start Google Chrome. Is it installed?\n" + err.message)
  process.exit(1)
})
// A fresh profile: no cookies, so nothing is logged in.
const context = await browser.newContext()
const page = await context.newPage()
await page.goto(embedUrl(todo[0].shortcode, todo[0].kind), { waitUntil: 'domcontentloaded' })

const results = new Map<string, Verdict>()
let cooledDown = false
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  let verdicts = await inspect(batch.map((p) => embedUrl(p.shortcode, p.kind)))

  if (verdicts.filter((v) => v === 'broken').length >= batch.length * THROTTLE_SHARE) {
    if (cooledDown) {
      console.log('\nInstagram seems to be limiting requests. Stopping early; run it again later to finish.')
      break
    }
    console.log(`\nLots of "broken" posts at once; Instagram may be limiting requests. Waiting ${COOLDOWN_MS / 1000}s and retrying…`)
    await sleep(COOLDOWN_MS)
    cooledDown = true
    verdicts = await inspect(batch.map((p) => embedUrl(p.shortcode, p.kind)))
  }

  batch.forEach((p, j) => results.set(p.shortcode, verdicts[j]))
  process.stdout.write(`\r  ${Math.min(i + BATCH, todo.length)}/${todo.length} checked`)
  await sleep(BATCH_PAUSE_MS)
}
process.stdout.write('\n')
await browser.close()

// ---------- write the file ----------

const now = Date.now()
const byVerdict = (v: Verdict) => todo.filter((p) => results.get(p.shortcode) === v)
const watchOnly = byVerdict('watch-only')
const marked: Post[] = watchOnly.map((p) => ({ ...p, categoryIds: [], status: 'unavailable', statusAt: now, unavailableReason: 'watch-only' }))

const date = new Date().toISOString().slice(0, 10)
const out = outArg ?? `saved-feed-watch-only-${date}.json`
writeFileSync(out, JSON.stringify(makeBackup({ posts: marked, categories: [] }), null, 1))

const label = (p: Post) => `${p.author ? '@' + p.author : p.shortcode} (${p.url})`
console.log(`
Plays in the app:        ${byVerdict('video').length + byVerdict('photo').length}
Only plays on Instagram: ${watchOnly.length}
Broken (deleted, or Instagram limiting): ${byVerdict('broken').length}  (not included; the app checks these itself)
Didn't finish loading:   ${byVerdict('timeout').length + (todo.length - results.size)}  (not included; run again to retry)
`)
if (watchOnly.length) console.log('Only plays on Instagram:\n' + watchOnly.map((p) => '  ' + label(p)).join('\n') + '\n')
console.log(`Wrote ${out}
On your phone: Settings → Restore from a backup file → pick it → Merge with my library.`)
