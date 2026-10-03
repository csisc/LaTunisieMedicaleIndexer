// Fails the GitHub Pages build if something the app needs at run time is missing from dist/.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', process.env.DIST || 'dist');
const must = ['index.html', 'articles.csv', 'created_log.csv', 'archive-index.json', 'ocr/worker.min.js', 'ocr/fra.traineddata'];
const missing = must.filter((f) => !fs.existsSync(path.join(dist, f)));
const cores = fs.existsSync(path.join(dist, 'ocr')) ? fs.readdirSync(path.join(dist, 'ocr')).filter((f) => /tesseract-core.*lstm\.wasm\.js$/.test(f)) : [];
if (!cores.length) missing.push('ocr/tesseract-core*-lstm.wasm.js');

const html = fs.existsSync(path.join(dist, 'index.html')) ? fs.readFileSync(path.join(dist, 'index.html'), 'utf-8') : '';
const base = process.env.VITE_BASE || '/';
if (base !== '/' && !html.includes(`${base}assets/`)) missing.push(`index.html does not reference ${base}assets/ (wrong VITE_BASE?)`);

if (missing.length) {
  console.error('[verify-dist] MISSING:\n - ' + missing.join('\n - '));
  process.exit(1);
}
const idx = JSON.parse(fs.readFileSync(path.join(dist, 'archive-index.json'), 'utf-8'));
const ocrDir = path.join(dist, 'ocr-text');
const texts = fs.existsSync(ocrDir) ? fs.readdirSync(ocrDir, { recursive: true }).filter((f) => String(f).endsWith('.txt')).length : 0;
console.log(`[verify-dist] ok — ${cores.length} OCR core(s), ${Object.keys(idx).length} volume(s) indexed, ${texts} OCR text(s) published`);
