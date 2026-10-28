/**
 * Instagram export parser.
 *
 * Instagram has shipped several JSON shapes for saved posts over the years, and
 * field names are localized ("Saved on" vs "Gespeichert am"). Instead of relying
 * on exact keys, this parser treats each top-level array element as a "record"
 * and looks *inside* it for the things we need:
 *
 *   - a post link (instagram.com/p/…, /reel/…, /reels/…, /tv/…)
 *   - a timestamp (seconds or ms, or an ISO date string)
 *   - an author (the record "title", or a "Username" label)
 *
 * Known shapes it handles:
 *
 * 1. saved_posts.json (2021–2024)
 *    { "saved_saved_media": [ { "title": "user",
 *        "string_map_data": { "Saved on": { "href": URL, "timestamp": 1700000000 } } } ] }
 *
 * 2. saved_collections.json (flat): a "Collection" header record, then the posts in it
 *    { "saved_saved_collections": [
 *        { "title": "Collection", "string_map_data": { "Name": { "value": "Recipes" }, "Creation Time": {…} } },
 *        { "title": "user", "string_map_data": { "Name": { "value": "user", "href": URL }, "Added Time": {…} } } ] }
 *
 * 3. Accounts Center "label_values" shape (2024+), as a bare array or wrapped
 *    [ { "timestamp": 1700000000, "label_values": [ { "label": "URL", "value": URL, "href": URL }, … ] } ]
 *
 * 4. Nested collections: one record per collection holding an array of posts.
 *
 * 5. Very old exports ({"saved_media": [["2019-…", "username"]]}) that have no
 *    links at all. These can't be embedded, so they are counted as skipped.
 */
import { isInstagramUrl, parsePostUrl, type PostRef } from './instagramUrl'
import type { ParsedCollection, ParsedPost, ParseReport, ParseResult, PostKind } from './types'

export interface ExportFile {
  /** Path or file name, e.g. "your_instagram_activity/saved/saved_posts.json". */
  name: string
  text: string
}

type Role = 'saved_posts' | 'collections' | 'other'

const SAVED_POSTS_KEYS = ['saved_saved_media', 'saved_media', 'saved_posts']
const COLLECTION_KEYS = ['saved_saved_collections', 'saved_collections', 'collections']

/** Is this file worth reading? Used to filter a full export down to the saved files. */
export function isSavedExportFile(name: string): boolean {
  return /\.json$/i.test(name) && /saved/i.test(name.split(/[\\/]/).pop() ?? '')
}

export function parseInstagramExport(files: ExportFile[]): ParseResult {
  const report: ParseReport = {
    files: [],
    linksSeen: 0,
    duplicates: 0,
    skipped: 0,
    byKind: { post: 0, reel: 0, igtv: 0 },
    warnings: [],
  }
  const posts = new Map<string, ParsedPost>()
  const collections = new Map<string, ParsedCollection>()
  const collectionMembers = new Map<string, Set<string>>()

  // Read saved_posts before collections so timestamps/authors from the main
  // list win, and collection data only fills gaps.
  const loaded = files
    .map((f) => loadFile(f, report))
    .filter((f): f is LoadedFile => f !== null)
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))

  if (loaded.length === 0) {
    report.warnings.push(
      'No saved-posts data found. Upload saved_posts.json and/or saved_collections.json (JSON format, not HTML).',
    )
  }

  const savedSeen = new Set<string>()

  for (const file of loaded) {
    const records = getRecords(file.json, file.role)
    const fileReport = { name: file.name, role: file.role, records: records.length, format: describeFormat(file.json, records) }
    report.files.push(fileReport)

    let current: string | null = null // collection the next records belong to (flat format)

    for (const record of records) {
      const a = analyzeRecord(record)

      if (a.type === 'header') {
        if (file.role === 'collections' && a.name) {
          current = a.name
          ensureCollection(a.name, a.createdAt)
        } else {
          report.skipped++
        }
        continue
      }

      const groupName = a.type === 'group' ? (a.name ?? current) : current
      if (a.type === 'group' && a.name && file.role === 'collections') ensureCollection(a.name, a.createdAt)

      for (const entry of a.entries) {
        report.linksSeen++
        const inCollection = file.role === 'collections' && groupName ? groupName : null

        // Duplicate = same post listed twice in saved_posts, or twice in the same collection.
        if (inCollection) {
          const members = collectionMembers.get(inCollection)!
          if (members.has(entry.ref.shortcode)) {
            report.duplicates++
            continue
          }
          members.add(entry.ref.shortcode)
        } else if (file.role !== 'collections') {
          if (savedSeen.has(entry.ref.shortcode)) report.duplicates++
          savedSeen.add(entry.ref.shortcode)
        }

        const existing = posts.get(entry.ref.shortcode)
        if (existing) {
          // Prefer a reel URL over /p/ when the same code shows up both ways.
          if (existing.kind === 'post' && entry.ref.kind !== 'post') {
            existing.kind = entry.ref.kind
            existing.url = entry.ref.url
          }
          existing.author ??= entry.author
          if (file.role !== 'collections' && entry.savedAt) {
            existing.savedAt = Math.min(existing.savedAt ?? Infinity, entry.savedAt)
          } else {
            existing.savedAt ??= entry.savedAt
          }
          if (inCollection && !existing.collections.includes(inCollection)) existing.collections.push(inCollection)
        } else {
          posts.set(entry.ref.shortcode, {
            shortcode: entry.ref.shortcode,
            kind: entry.ref.kind,
            url: entry.ref.url,
            author: entry.author,
            savedAt: entry.savedAt,
            collections: inCollection ? [inCollection] : [],
          })
        }
      }

      if (a.type === 'entry' || a.type === 'group') continue
      report.skipped++ // a.type === 'empty'
    }

    if (file.role === 'collections' && records.length > 0 && collections.size === 0) {
      report.warnings.push(`${file.name}: couldn't find any collection names; posts were imported without categories.`)
    }
  }

  function ensureCollection(name: string, createdAt?: number) {
    if (!collections.has(name)) {
      collections.set(name, { name, createdAt, count: 0 })
      collectionMembers.set(name, new Set())
    }
  }

  for (const [name, members] of collectionMembers) collections.get(name)!.count = members.size

  const list = [...posts.values()].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
  for (const p of list) report.byKind[p.kind]++

  if (report.skipped > 0 && list.length === 0) {
    report.warnings.push(
      'Records were found but none had a post link. Very old exports only list usernames, which cannot be embedded. Request a new export in JSON format.',
    )
  }

  return { posts: list, collections: [...collections.values()], report }
}

// ---------------------------------------------------------------------------
// File loading

interface LoadedFile {
  name: string
  role: Role
  json: unknown
}

function loadFile(file: ExportFile, report: ParseReport): LoadedFile | null {
  const base = file.name.split(/[\\/]/).pop() ?? file.name
  const trimmed = file.text.trimStart()
  if (/\.html?$/i.test(base) || trimmed.startsWith('<')) {
    report.warnings.push(`${base} is HTML. Request your Instagram export in JSON format instead.`)
    return null
  }
  let json: unknown
  try {
    json = fixEncoding(JSON.parse(file.text.replace(/^﻿/, '')))
  } catch {
    report.warnings.push(`${base} is not valid JSON and was skipped.`)
    return null
  }
  return { name: base, role: detectRole(base, json), json }
}

function detectRole(name: string, json: unknown): Role {
  if (/saved_collections/i.test(name)) return 'collections'
  if (/saved_posts|saved_media/i.test(name)) return 'saved_posts'
  if (isObject(json)) {
    const keys = Object.keys(json)
    if (keys.some((k) => COLLECTION_KEYS.includes(k))) return 'collections'
    if (keys.some((k) => SAVED_POSTS_KEYS.includes(k))) return 'saved_posts'
  }
  return /collection/i.test(name) ? 'collections' : 'other'
}

function roleOrder(role: Role) {
  return role === 'saved_posts' ? 0 : role === 'other' ? 1 : 2
}

/** Find the list of records in a file, whatever it is wrapped in. */
function getRecords(json: unknown, role: Role): unknown[] {
  if (Array.isArray(json)) return json
  if (!isObject(json)) return []
  const preferred = role === 'collections' ? COLLECTION_KEYS : SAVED_POSTS_KEYS
  for (const k of preferred) if (Array.isArray(json[k])) return json[k] as unknown[]
  // Otherwise take the biggest array found within two levels.
  let best: unknown[] = []
  for (const v of Object.values(json)) {
    if (Array.isArray(v) && v.length > best.length) best = v
    else if (isObject(v)) {
      for (const w of Object.values(v)) if (Array.isArray(w) && w.length > best.length) best = w
    }
  }
  return best
}

function describeFormat(json: unknown, records: unknown[]): string {
  const wrapper = Array.isArray(json) ? 'array' : isObject(json) ? `{${Object.keys(json).join(', ')}}` : typeof json
  const first = records.find(isObject)
  let shape = 'empty'
  if (first) {
    if ('string_map_data' in first) shape = 'string_map_data'
    else if ('label_values' in first) shape = 'label_values'
    else shape = `keys: ${Object.keys(first).slice(0, 5).join(', ')}`
  } else if (records.some(Array.isArray)) shape = 'tuples (legacy)'
  return `${wrapper} → ${shape}`
}

// ---------------------------------------------------------------------------
// Record analysis

interface Entry {
  ref: PostRef
  savedAt?: number
  author?: string
}

type Analysis =
  | { type: 'entry'; entries: [Entry] }
  | { type: 'group'; name?: string; createdAt?: number; entries: Entry[] }
  | { type: 'header'; name?: string; createdAt?: number }
  | { type: 'empty'; entries: [] }

export function analyzeRecord(record: unknown): Analysis {
  if (typeof record === 'string') {
    const ref = parsePostUrl(record)
    return ref ? { type: 'entry', entries: [{ ref }] } : { type: 'empty', entries: [] }
  }
  const refs = collectRefs(record)

  if (refs.size === 0) {
    if (isObject(record)) {
      const name = findName(record)
      if (name) return { type: 'header', name, createdAt: findTimestamp(record, /creat/i) ?? findTimestamp(record) }
    }
    return { type: 'empty', entries: [] }
  }

  if (refs.size === 1) {
    const ref = refs.values().next().value!
    return { type: 'entry', entries: [{ ref, savedAt: findTimestamp(record), author: findAuthor(record) }] }
  }

  // Several posts inside one record: a nested collection (or some grouping).
  const entries: Entry[] = []
  const seen = new Set<string>()
  for (const child of memberNodes(record)) {
    const sub = analyzeRecord(child)
    if (sub.type === 'entry' || sub.type === 'group') {
      for (const e of sub.entries) {
        if (!seen.has(e.ref.shortcode)) {
          seen.add(e.ref.shortcode)
          entries.push(e)
        }
      }
    }
  }
  const name = isObject(record) ? findName(record) : undefined
  return { type: 'group', name, createdAt: findTimestamp(record, /creat/i), entries }
}

/** Elements of arrays inside a record that each carry at least one post link. */
function memberNodes(record: unknown): unknown[] {
  const out: unknown[] = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      const withRefs = node.filter((el) => collectRefs(el).size > 0)
      // An array of field descriptors (label_values) where only one field has the
      // link is not a member list; descend instead.
      if (withRefs.length > 1 || (withRefs.length === 1 && collectRefs(withRefs[0]).size === 1 && !isFieldList(node))) {
        out.push(...withRefs)
      } else {
        node.forEach(visit)
      }
    } else if (isObject(node)) {
      Object.values(node).forEach(visit)
    }
  }
  visit(record)
  return out
}

function isFieldList(arr: unknown[]): boolean {
  return arr.length > 0 && arr.every((el) => isObject(el) && typeof el.label === 'string')
}

function collectRefs(node: unknown, out = new Map<string, PostRef>(), depth = 0): Map<string, PostRef> {
  if (depth > 12) return out
  if (typeof node === 'string') {
    if (node.length < 300 && isInstagramUrl(node)) {
      const ref = parsePostUrl(node)
      if (ref && !out.has(ref.shortcode)) out.set(ref.shortcode, ref)
      else if (ref && ref.kind !== 'post') out.set(ref.shortcode, ref) // prefer reel over /p/
    }
  } else if (Array.isArray(node)) {
    for (const v of node) collectRefs(v, out, depth + 1)
  } else if (isObject(node)) {
    for (const v of Object.values(node)) collectRefs(v, out, depth + 1)
  }
  return out
}

const GENERIC_TITLES = new Set(['collection', 'collections', 'saved', ''])

/** A collection name: "Name" field, a "Collection" label, a name property, or the title. */
function findName(record: Record<string, unknown>): string | undefined {
  const smd = record.string_map_data
  if (isObject(smd)) {
    for (const [k, v] of Object.entries(smd)) {
      if (/^(name|collection( name)?)$/i.test(k) && isObject(v) && typeof v.value === 'string' && !v.href) return clean(v.value)
    }
  }
  const lv = record.label_values
  if (Array.isArray(lv)) {
    for (const f of lv) {
      if (isObject(f) && typeof f.label === 'string' && /^(name|collection( name)?|title)$/i.test(f.label) && typeof f.value === 'string' && !isInstagramUrl(f.value)) {
        return clean(f.value)
      }
    }
  }
  for (const k of ['name', 'collection_name', 'collection', 'title']) {
    const v = record[k]
    if (typeof v === 'string' && !GENERIC_TITLES.has(v.trim().toLowerCase()) && !isInstagramUrl(v)) return clean(v)
  }
  // Localized exports: fall back to the first plain string in string_map_data.
  if (isObject(smd)) {
    for (const v of Object.values(smd)) {
      if (isObject(v) && typeof v.value === 'string' && !isInstagramUrl(v.value) && !v.href) return clean(v.value)
    }
  }
  return undefined
}

function findAuthor(record: unknown): string | undefined {
  if (!isObject(record)) return undefined
  // label_values: { label: "Username", value: "natgeo" } possibly nested inside an "Owner" dict.
  const label = findLabelValue(record, /^(username|user ?name|owner|author|account)$/i)
  if (label) return clean(label)
  const title = record.title
  if (typeof title === 'string' && !GENERIC_TITLES.has(title.trim().toLowerCase()) && !isInstagramUrl(title)) return clean(title)
  // Collections member: { Name: { value: "natgeo", href: URL } }
  const smd = record.string_map_data
  if (isObject(smd)) {
    for (const v of Object.values(smd)) {
      if (isObject(v) && typeof v.value === 'string' && typeof v.href === 'string' && !isInstagramUrl(v.value)) return clean(v.value)
    }
  }
  for (const k of ['username', 'author', 'owner']) if (typeof record[k] === 'string') return clean(record[k] as string)
  return undefined
}

function findLabelValue(node: unknown, label: RegExp, depth = 0): string | undefined {
  if (depth > 8) return undefined
  if (Array.isArray(node)) {
    // Prefer "Username" over "Name" when both exist in the same dict.
    for (const el of node) {
      if (isObject(el) && typeof el.label === 'string' && label.test(el.label) && typeof el.value === 'string' && el.value && !isInstagramUrl(el.value)) {
        return el.value
      }
    }
    for (const el of node) {
      const v = findLabelValue(el, label, depth + 1)
      if (v) return v
    }
  } else if (isObject(node)) {
    for (const v of Object.values(node)) {
      const r = findLabelValue(v, label, depth + 1)
      if (r) return r
    }
  }
  return undefined
}

/** First timestamp in the record. If keyHint is given, prefer keys/labels that match it. */
function findTimestamp(node: unknown, keyHint?: RegExp): number | undefined {
  let fallback: number | undefined
  let hinted: number | undefined
  const visit = (n: unknown, key: string, depth: number) => {
    if (depth > 8 || (hinted !== undefined && fallback !== undefined)) return
    if (typeof n === 'number' || typeof n === 'string') {
      if (!/time|date|saved|added|creat/i.test(key)) return
      const t = toMs(n)
      if (t === undefined) return
      if (keyHint && keyHint.test(key)) hinted ??= t
      fallback ??= t
      return
    }
    if (Array.isArray(n)) n.forEach((v) => visit(v, key, depth + 1))
    else if (isObject(n)) {
      // label_values: { label: "Creation Time", timestamp_value: 1700000000 }
      const ctx = typeof n.label === 'string' ? n.label : key
      for (const [k, v] of Object.entries(n)) visit(v, k === 'timestamp' || k === 'timestamp_value' || k === 'value' ? `${ctx} ${k}` : k, depth + 1)
    }
  }
  visit(node, '', 0)
  return keyHint ? (hinted ?? fallback) : fallback
}

function toMs(v: number | string): number | undefined {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return undefined
    const ms = v < 1e11 ? v * 1000 : v
    return ms > 946684800000 && ms < 4102444800000 ? ms : undefined // 2000..2100
  }
  if (/^\d{9,13}$/.test(v)) return toMs(Number(v))
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined
  const t = Date.parse(v)
  return Number.isNaN(t) ? undefined : t
}

// ---------------------------------------------------------------------------
// Helpers

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Instagram exports write UTF-8 bytes as if they were Latin-1 characters, so
 * "café" arrives as "cafÃ©" and emoji as "ð\u009f…". Re-decode those strings.
 */
export function fixText(s: string): string {
  if (!/[\u0080-ÿ]/.test(s)) return s
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0xff) return s // already real Unicode
    bytes[i] = c
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return s
  }
}

function fixEncoding(v: unknown): unknown {
  if (typeof v === 'string') return fixText(v)
  if (Array.isArray(v)) return v.map(fixEncoding)
  if (isObject(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[fixText(k)] = fixEncoding(val)
    return out
  }
  return v
}

export const KIND_LABEL: Record<PostKind, string> = { post: 'Post', reel: 'Reel', igtv: 'Video' }
