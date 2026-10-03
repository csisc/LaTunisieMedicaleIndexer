// Shared by the CI scripts: reads a volume's page list from the archive's reader page (no CORS issue in Node),
// with the same parser as the browser (src/lib/archive.ts), so there is a single source of truth.
import fs from 'node:fs';
import path from 'node:path';
import { parseReaderHtml, readerUrl, volumeSlug, type VolumeEntry } from '../src/lib/archive.ts';

export const root = path.resolve(import.meta.dirname, '..');
export const INDEX_FILE = process.env.INDEX_FILE || path.join(root, 'public/archive-index.json');
export const norm = (v: string) => v.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
export { volumeSlug };

export const UA = 'Mozilla/5.0 (compatible; LaTunisieMedicaleIndexer CI)';

export type ArchiveIndex = Record<string, VolumeEntry>;

export function readIndex(): ArchiveIndex {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  } catch {
    return {};
  }
}
export function writeIndex(index: ArchiveIndex) {
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index));
}

/** Volumes and pages of the work queue (articles.csv + created_log.csv), in queue order. */
export function queuePages(files = ['articles.csv', 'created_log.csv']): { vol: string; page: number }[] {
  const out: { vol: string; page: number }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const p = process.env.ARTICLES_CSV && f === 'articles.csv' ? process.env.ARTICLES_CSV : path.join(root, 'backend/data', f);
    if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, 'utf-8').matchAll(/Lecteur_des_archives\/([^#?,"\s]+)[^,"\s]*?#page\/(\d+)/g)) {
      let vol = m[1];
      try {
        vol = decodeURIComponent(vol);
      } catch {
        /* keep raw */
      }
      vol = vol.replace(/\+/g, ' ').trim();
      const id = `${norm(vol)}|${m[2]}`;
      if (!seen.has(id)) (seen.add(id), out.push({ vol, page: parseInt(m[2], 10) }));
    }
  }
  return out;
}

export async function fetchVolume(volume: string): Promise<VolumeEntry> {
  let last: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(readerUrl(volume), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entry = parseReaderHtml(await res.text(), volume);
      if (!entry) throw new Error('page list not found in reader HTML');
      return entry;
    } catch (e: any) {
      last = e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw last!;
}

/** Index entry of a volume: from the file if present, else read from the archive and saved. */
export async function ensureVolume(index: ArchiveIndex, volume: string): Promise<VolumeEntry | null> {
  const k = norm(volume);
  if (index[k]?.files?.length) return index[k];
  try {
    index[k] = await fetchVolume(volume);
    console.log(`[index] ${volume}: ${index[k].files.length} pages`);
    return index[k];
  } catch (e: any) {
    console.warn(`[index] ${volume}: ${e.message}`);
    return null;
  }
}
