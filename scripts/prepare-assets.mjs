// Copies what the static site needs into public/ (generated, git-ignored):
//   - the Tesseract worker + wasm core, so OCR needs no CDN
//   - the work queue (articles.csv) and the log of created pages
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'public');
fs.mkdirSync(path.join(pub, 'ocr'), { recursive: true });

const copy = (from, to) => {
  if (!fs.existsSync(from)) throw new Error(`Missing ${from} (run npm install first)`);
  fs.copyFileSync(from, to);
};

copy(path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'), path.join(pub, 'ocr/worker.min.js'));
// The default engine is LSTM: only the *-lstm cores are ever requested (three CPU variants, picked at run time)
const coreDir = path.join(root, 'node_modules/tesseract.js-core');
for (const f of fs.readdirSync(coreDir)) {
  if (/^tesseract-core.*lstm\.wasm\.js$/.test(f)) copy(path.join(coreDir, f), path.join(pub, 'ocr', f));
}
for (const f of ['articles.csv', 'created_log.csv']) {
  const src = path.join(root, 'backend/data', f);
  if (fs.existsSync(src)) copy(src, path.join(pub, f));
}
console.log('[assets] OCR engine and work queue copied to public/');
