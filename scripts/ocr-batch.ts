// Pre-computes the OCR of every page of the work queue on GitHub's servers (no CORS limits in Node) and writes
// public/ocr-text/<volume>/<page>.txt, which GitHub Pages then serves to the app. Already-done pages are skipped.
// Volumes missing from the index are read from the archive on the fly.
// Env: MAX_MINUTES (default 300), WORKERS (default 3), LIMIT (default none), ONLY (substring of the URL to restrict to).
import fs from 'node:fs';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { root, queuePages, readIndex, writeIndex, ensureVolume, volumeSlug, UA } from './archive-node.ts';
import { looksLikeImage } from '../src/lib/archiveFetch.ts';

const OUT = process.env.OUT_DIR || path.join(root, 'public/ocr-text');
const LANG_DIR = process.env.LANG_DIR || path.join(root, 'public/ocr');
const IMAGE_BASE = (process.env.IMAGE_BASE || 'https://search.archives.nat.tn/uploads').replace(/\/$/, '');
const MAX_MS = Number(process.env.MAX_MINUTES ?? 300) * 60_000;
const WORKERS = Number(process.env.WORKERS ?? 3);
const LIMIT = Number(process.env.LIMIT ?? Infinity);
const ONLY = (process.env.ONLY ?? '').toLowerCase();
const started = Date.now();

const fileOf = (p: { vol: string; page: number }) => path.join(OUT, volumeSlug(p.vol), `${p.page}.txt`);
const pages = queuePages(['articles.csv']).filter((p) => !ONLY || `${p.vol}#${p.page}`.toLowerCase().includes(ONLY));
const todo = pages.filter((p) => !fs.existsSync(fileOf(p)));
console.log(`[ocr] ${pages.length} pages in the queue, ${pages.length - todo.length} already done, ${todo.length} to do`);

const index = readIndex();
let done = 0, failed = 0, next = 0;
const volumeLocks = new Map<string, Promise<unknown>>();
const withVolume = (vol: string) => {
  // one worker reads a given volume, the others wait for it
  if (!volumeLocks.has(vol)) volumeLocks.set(vol, ensureVolume(index, vol));
  return volumeLocks.get(vol) as ReturnType<typeof ensureVolume>;
};

async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://search.archives.nat.tn/' }, signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!looksLikeImage(buf.subarray(0, 8))) throw new Error('not an image');
      return buf;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('unreachable');
}

async function run() {
  const worker = await createWorker('fra', 1, { langPath: LANG_DIR, gzip: false });
  while (true) {
    if (Date.now() - started > MAX_MS || done + failed >= LIMIT) break;
    const p = todo[next++];
    if (!p) break;
    const entry = await withVolume(p.vol);
    if (!entry?.files?.length) {
      failed++;
      continue;
    }
    const file = entry.files[Math.max(0, Math.min(p.page - 1, entry.files.length - 1))];
    const url = `${IMAGE_BASE}/${encodeURIComponent(entry.folder)}/${encodeURIComponent(file)}`;
    try {
      const img = await download(url);
      const { data } = await worker.recognize(img);
      fs.mkdirSync(path.dirname(fileOf(p)), { recursive: true });
      fs.writeFileSync(fileOf(p), data.text || '', 'utf-8');
      done++;
      console.log(`[ocr] ${p.vol} p.${p.page} ok (${(data.text || '').length} chars) — ${done} done, ${Math.max(0, todo.length - next)} left`);
    } catch (e: any) {
      failed++;
      console.warn(`[ocr] ${p.vol} p.${p.page} failed: ${e.message}`);
    }
  }
  await worker.terminate();
}

await Promise.all(Array.from({ length: Math.max(1, WORKERS) }, run));
writeIndex(index);

const remaining = Math.max(0, todo.length - done - failed);
console.log(`[ocr] finished: ${done} done, ${failed} failed, ${remaining} not attempted`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `done=${done}\nfailed=${failed}\nremaining=${remaining}\n`);
}
