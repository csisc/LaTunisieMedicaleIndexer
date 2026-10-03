// Pre-computes the OCR of every pending page, in CI (a browser cannot read the scans: the archive sends no CORS header).
// For each page of the work queue it downloads the scan, runs Tesseract (French) and writes public/ocr-text/<volume>/<page>.txt.
// Already-done pages are skipped, so the job can be run again and again until the queue is covered.
//
// Env: MAX_MINUTES (default 300) stop starting new pages after this time; WORKERS (default 3); LIMIT (default none).
import fs from 'node:fs';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

const root = path.resolve(import.meta.dirname, '..');
const ARTICLES = process.env.ARTICLES_CSV || path.join(root, 'backend/data/articles.csv');
const INDEX = process.env.INDEX_FILE || path.join(root, 'public/archive-index.json');
const OUT = process.env.OUT_DIR || path.join(root, 'public/ocr-text');
const LANG_DIR = process.env.LANG_DIR || path.join(root, 'public/ocr');
const IMAGE_BASE = (process.env.IMAGE_BASE || 'https://search.archives.nat.tn/uploads').replace(/\/$/, '');
const MAX_MS = Number(process.env.MAX_MINUTES ?? 300) * 60_000;
const WORKERS = Number(process.env.WORKERS ?? 3);
const LIMIT = Number(process.env.LIMIT ?? Infinity);
const started = Date.now();

// must match src/lib/archive.ts
const norm = (v) => v.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const slug = (v) =>
  norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// queue -> unique (volume, page), in queue order
const pages = [];
const seen = new Set();
for (const m of fs.readFileSync(ARTICLES, 'utf-8').matchAll(/Lecteur_des_archives\/([^#?,"\s]+)[^,"\s]*?#page\/(\d+)/g)) {
  let vol = m[1];
  try { vol = decodeURIComponent(vol); } catch {}
  const id = `${slug(vol)}|${m[2]}`;
  if (!seen.has(id)) (seen.add(id), pages.push({ vol: vol.replace(/\+/g, ' ').trim(), page: parseInt(m[2], 10) }));
}

let index = {};
try { index = JSON.parse(fs.readFileSync(INDEX, 'utf-8')); } catch {}

const fileOf = (p) => path.join(OUT, slug(p.vol), `${p.page}.txt`);
const todo = pages.filter((p) => !fs.existsSync(fileOf(p)));
console.log(`[ocr] ${pages.length} pages in the queue, ${pages.length - todo.length} already done, ${todo.length} to do`);

let done = 0, failed = 0, next = 0;
const noIndex = new Set();

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaTunisieMedicaleIndexer OCR)', Referer: 'https://search.archives.nat.tn/' },
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function run() {
  const worker = await createWorker('fra', 1, { langPath: LANG_DIR, gzip: false });
  while (true) {
    if (Date.now() - started > MAX_MS || done + failed >= LIMIT) break;
    const p = todo[next++];
    if (!p) break;
    const entry = index[norm(p.vol)];
    if (!entry?.files?.length) {
      if (!noIndex.has(p.vol)) (noIndex.add(p.vol), console.warn(`[ocr] no page list for volume "${p.vol}" (skipped)`));
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
    } catch (e) {
      failed++;
      console.warn(`[ocr] ${p.vol} p.${p.page} failed: ${e.message}`);
    }
  }
  await worker.terminate();
}

await Promise.all(Array.from({ length: Math.max(1, WORKERS) }, run));

const remaining = todo.length - done - failed;
console.log(`[ocr] finished: ${done} done, ${failed} failed, ${Math.max(0, remaining)} not attempted`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `done=${done}\nfailed=${failed}\nremaining=${Math.max(0, remaining)}\n`);
}
