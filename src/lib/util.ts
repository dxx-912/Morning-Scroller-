import { hashString } from './shuffle'

/**
 * Random id. crypto.randomUUID only exists in secure contexts, and the dev
 * server is opened over plain http://192.168.x.x on a phone, so fall back.
 */
export function makeId(prefix = ''): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return prefix + c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Stable id for a category created from an Instagram collection. */
export function collectionCategoryId(name: string): string {
  return `ig-${hashString(name.toLowerCase()).toString(36)}`
}

/** Pleasant, spread-out hue for a name. */
export function hueFor(name: string): number {
  return hashString(name) % 360
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function formatDate(ms?: number): string {
  return ms ? dateFmt.format(ms) : 'Unknown date'
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
