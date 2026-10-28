import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportFile } from '../src/lib/parser'

export function fixture(dir: string): ExportFile[] {
  const base = join(import.meta.dirname, '..', 'fixtures', dir)
  return readdirSync(base)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: `${dir}/${f}`, text: readFileSync(join(base, f), 'utf8') }))
}
