// Builds public/archive-index.json: for each volume of the work queue, the folder and the ordered list of page images
// published by the archive reader. Browsers cannot read the reader page (cross-origin), so this runs in CI.
// Volumes already in the file are kept; if the archive cannot be reached the existing file is left as is.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public/archive-index.json');
const READER = 'https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/';

const volumes = new Set();
for (const f of ['articles.csv', 'created_log.csv']) {
  const p = path.join(root, 'backend/data', f);
  if (!fs.existsSync(p)) continue;
  for (const m of fs.readFileSync(p, 'utf-8').matchAll(/Lecteur_des_archives\/([^#?,"\s]+)/g)) {
    volumes.add(decodeURIComponent(m[1]).replace(/\+/g, ' ').trim());
  }
}

const norm = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase();
let index = {};
try {
  index = JSON.parse(fs.readFileSync(out, 'utf-8'));
} catch {}

let added = 0;
let failed = 0;
for (const vol of [...volumes].sort()) {
  if (index[norm(vol)]?.files?.length) continue;
  try {
    const res = await fetch(READER + encodeURIComponent(vol), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaTunisieMedicaleIndexer build)' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const folder = html.match(/var\s+folder\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? vol;
    const a = html.indexOf('var files=');
    const b = html.indexOf('files=JSON.parse(files)');
    if (a === -1 || b === -1) throw new Error('page list not found in reader HTML');
    let files = JSON.parse(html.slice(a + 'var files='.length, b).trim().replace(/;$/, ''));
    if (typeof files === 'string') files = JSON.parse(files);
    index[norm(vol)] = { folder, files };
    added++;
    console.log(`[index] ${vol}: ${files.length} pages`);
  } catch (e) {
    failed++;
    console.warn(`[index] ${vol}: ${e.message}`);
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(index));
console.log(`[index] ${Object.keys(index).length} volumes (${added} added, ${failed} failed)`);
