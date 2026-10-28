import { strFromU8, unzipSync } from 'fflate'
import { isSavedExportFile, type ExportFile } from './parser'

/** Pull just the saved-posts JSON files out of an export .zip (skips media, so it stays fast). */
export function extractSavedFromZip(data: Uint8Array): ExportFile[] {
  const entries = unzipSync(data, { filter: (f) => isSavedExportFile(f.name) && !f.name.startsWith('__MACOSX') })
  return Object.entries(entries).map(([name, bytes]) => ({ name, text: strFromU8(bytes) }))
}

/**
 * Read files picked or dropped in the browser: .json files, a whole export
 * folder, or the export .zip.
 */
export async function readExportFiles(picked: File[]): Promise<ExportFile[]> {
  const out: ExportFile[] = []
  const jsons = picked.filter((f) => /\.json$/i.test(f.name))
  // A few hand-picked files are taken as-is; a whole folder is filtered to the saved files.
  const takeAll = jsons.length <= 3 && !jsons.some((f) => f.webkitRelativePath)

  for (const f of picked) {
    const path = f.webkitRelativePath || f.name
    if (/\.zip$/i.test(f.name)) {
      out.push(...extractSavedFromZip(new Uint8Array(await f.arrayBuffer())))
    } else if (/\.json$/i.test(f.name) && (takeAll || isSavedExportFile(path))) {
      out.push({ name: path, text: await f.text() })
    } else if (/\.html?$/i.test(f.name) && /saved/i.test(f.name)) {
      out.push({ name: path, text: await f.text() }) // parser turns this into a helpful warning
    }
  }
  return out
}
