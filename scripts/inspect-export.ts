/**
 * Inspect an Instagram export and show what Saved Feed will import from it.
 *
 *   npm run inspect                       # scans ./sample-data
 *   npm run inspect -- ~/Downloads/instagram-export.zip
 *
 * Prints the structure of each saved-posts file (with values replaced by their
 * types) and the parser's report. Usernames are masked.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { extractSavedFromZip } from '../src/lib/exportFiles.ts'
import { isSavedExportFile, parseInstagramExport, type ExportFile } from '../src/lib/parser.ts'

const target = process.argv[2] ?? 'sample-data'
if (!existsSync(target)) {
  console.error(`Not found: ${target}`)
  process.exit(1)
}

function collect(path: string, root: string, out: ExportFile[]) {
  const st = statSync(path)
  if (st.isDirectory()) {
    for (const f of readdirSync(path)) collect(join(path, f), root, out)
  } else if (/\.zip$/i.test(path)) {
    out.push(...extractSavedFromZip(new Uint8Array(readFileSync(path))).map((f) => ({ ...f, name: `${relative(root, path)}!/${f.name}` })))
  } else if (isSavedExportFile(path) || (/\.json$/i.test(path) && path === root)) {
    out.push({ name: relative(root, path) || path, text: readFileSync(path, 'utf8') })
  } else if (/saved.*\.html?$/i.test(path)) {
    out.push({ name: relative(root, path), text: readFileSync(path, 'utf8') })
  }
}

const files: ExportFile[] = []
collect(target, statSync(target).isDirectory() ? target : target, files)

const mask = (s?: string) => (s ? s.slice(0, 2) + '•'.repeat(Math.max(1, Math.min(6, s.length - 2))) : '—')

/** Replace every value with its type so the structure is visible without your data. */
function skeleton(v: unknown, depth = 0): unknown {
  if (depth > 6) return '…'
  if (Array.isArray(v)) return v.length ? [skeleton(v[0], depth + 1), `…${v.length} items`] : []
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, skeleton(x, depth + 1)]))
  if (typeof v === 'string') return /^https?:/.test(v) ? `<url ${v.replace(/^https?:\/\/(www\.)?/, '').split('/').slice(0, 2).join('/')}/…>` : '<string>'
  return `<${typeof v}>`
}

console.log(`\nSaved Feed export inspector: ${target}\n`)
if (files.length === 0) {
  console.log('No saved-posts files found. Expected saved_posts.json and/or saved_collections.json')
  console.log('(usually under your_instagram_activity/saved/ in the export).')
  process.exit(0)
}

for (const f of files) {
  console.log(`── ${f.name} (${(f.text.length / 1024).toFixed(1)} KB)`)
  try {
    const json = JSON.parse(f.text)
    const top = Array.isArray(json) ? `array of ${json.length}` : `object with keys: ${Object.keys(json).join(', ')}`
    console.log(`   top level: ${top}`)
    const list: unknown[] = Array.isArray(json) ? json : (Object.values(json).find(Array.isArray) as unknown[]) ?? []
    if (list.length) {
      console.log('   first record shape:')
      console.log(
        JSON.stringify(skeleton(list[0]), null, 2)
          .split('\n')
          .map((l) => '     ' + l)
          .join('\n'),
      )
    }
  } catch {
    console.log('   (not valid JSON)')
  }
  console.log()
}

const { posts, collections, report } = parseInstagramExport(files)
const dates = posts.map((p) => p.savedAt).filter((d): d is number => !!d)
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10)

console.log('── Parser result')
for (const f of report.files) console.log(`   ${f.name}: ${f.role}, ${f.records} records, format ${f.format}`)
console.log(`   unique posts:   ${posts.length}  (posts ${report.byKind.post}, reels ${report.byKind.reel}, igtv ${report.byKind.igtv})`)
console.log(`   links seen:     ${report.linksSeen}  (duplicates ${report.duplicates}, skipped records ${report.skipped})`)
if (dates.length) console.log(`   saved between:  ${fmt(Math.min(...dates))} and ${fmt(Math.max(...dates))}`)
console.log(`   without date:   ${posts.length - dates.length}`)
console.log(`   in a collection: ${posts.filter((p) => p.collections.length).length}, in none: ${posts.filter((p) => !p.collections.length).length}`)
console.log(`   collections (${collections.length}):`)
for (const c of collections) console.log(`     • ${c.name} — ${c.count}`)
if (report.warnings.length) {
  console.log('   warnings:')
  for (const w of report.warnings) console.log(`     ! ${w}`)
}
console.log('   sample:')
for (const p of posts.slice(0, 5)) {
  console.log(`     ${p.kind.padEnd(5)} ${p.shortcode.padEnd(14)} by ${mask(p.author).padEnd(8)} ${p.savedAt ? fmt(p.savedAt) : '?'}  [${p.collections.join(', ')}]`)
}
console.log()
