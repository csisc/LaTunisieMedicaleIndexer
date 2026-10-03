import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseReaderHtml, parseReaderUrl, resolveArchivePage } from './archive.ts';
import { archiveImage, archiveText, ArchiveFetchError, looksLikeImage } from './archiveFetch.ts';
import { looksLikeAuthorLine, parseArticleOffline } from '../utils/offlineParser.ts';
import { autoReconcileAuthor, normName, suggestSubjects, titleNgrams } from './wikidata.ts';
import { volumeForYear } from '../api.ts';
import { DEFAULT_ARCHIVE_URL } from '../config.ts';
import { store } from '../../backend/csvStore.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const realFetch = globalThis.fetch;
const restore = () => void (globalThis.fetch = realFetch);

/* ---------- the restored default page ---------- */

test('the 1954 page 23 URL is the default and is in the work queue', () => {
  assert.equal(DEFAULT_ARCHIVE_URL, 'https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/23/mode/2up');
  assert.deepEqual(parseReaderUrl(DEFAULT_ARCHIVE_URL), { volume: 'La Tunisie Medicale-1954', page: 23 });
  const row = store.findByUrl(DEFAULT_ARCHIVE_URL);
  assert.ok(row, 'row present in backend/data/articles.csv');
  assert.equal(row!.year, 1954);
  assert.equal(row!.page, '23');
});

/* ---------- reader page parsing (no prebuilt index) ---------- */

test('parseReaderHtml: JSON list followed by JSON.parse (format used by the archive reader)', () => {
  const html = `<script>var folder = 'La Tunisie Medicale-1954';
var files=["0001.jpg","0002.jpg","0010.jpg"];
files=JSON.parse(files)</script>`;
  assert.deepEqual(parseReaderHtml(html, 'x'), { folder: 'La Tunisie Medicale-1954', files: ['0001.jpg', '0002.jpg', '0010.jpg'] });
});

test('parseReaderHtml: double-encoded JSON string', () => {
  const html = `var folder="V";var files='["a.jpg","b.jpg"]';files=JSON.parse(files)`;
  assert.deepEqual(parseReaderHtml(html, 'x')?.files, ['a.jpg', 'b.jpg']);
});

test('parseReaderHtml: falls back to the images and PDF link mentioned in the page', () => {
  const html = `<a href="https://search.archives.nat.tn/uploads/La Tunisie Medicale-1954/ant-archive.pdf">PDF</a>
<img src="/uploads/La%20Tunisie%20Medicale-1954/p10.jpg"><img src="/uploads/La%20Tunisie%20Medicale-1954/p2.jpg">`;
  assert.deepEqual(parseReaderHtml(html, 'x'), { folder: 'La Tunisie Medicale-1954', files: ['p2.jpg', 'p10.jpg'] });
});

test('parseReaderHtml: a page without any scan list is rejected', () => {
  assert.equal(parseReaderHtml('<html><a href="x.pdf">PDF</a></html>', 'x'), null);
});

test('resolveArchivePage reads the volume at run time and maps #page/n to the n-th file', async () => {
  const seen: string[] = [];
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    seen.push(url);
    if (url.endsWith('archive-index.json')) return new Response('{}', { status: 200 });
    if (url.includes('Lecteur_des_archives')) {
      return new Response(`var folder='La Tunisie Medicale-1954';var files=${JSON.stringify(Array.from({ length: 40 }, (_, i) => `${String(i + 1).padStart(4, '0')}.jpg`))};files=JSON.parse(files)`, { status: 200 });
    }
    return new Response('nope', { status: 404 });
  }) as any;
  try {
    const r = await resolveArchivePage(DEFAULT_ARCHIVE_URL);
    assert.equal(r.fileName, '0023.jpg');
    assert.equal(r.totalPages, 40);
    assert.equal(r.imageUrl, 'https://search.archives.nat.tn/uploads/La%20Tunisie%20Medicale-1954/0023.jpg');
    assert.ok(seen.some((u) => u.includes('Lecteur_des_archives/La%20Tunisie%20Medicale-1954')));
  } finally {
    restore();
  }
});

/* ---------- access routes ---------- */

test('archiveImage falls through direct -> proxies and refuses HTML error pages', async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    calls.push(url);
    if (url.startsWith('https://search.archives.nat.tn')) throw new TypeError('Failed to fetch'); // no CORS
    if (url.startsWith('https://corsproxy.io')) return new Response('<html>blocked</html>', { status: 200 });
    if (url.startsWith('https://api.allorigins.win')) return new Response(JPEG, { status: 200 });
    return new Response('', { status: 500 });
  }) as any;
  try {
    const { blob, route, attempts } = await archiveImage('https://search.archives.nat.tn/uploads/V/1.jpg');
    assert.equal(route, 'allorigins');
    assert.equal(blob.size, JPEG.length);
    assert.deepEqual(attempts.map((a) => [a.route, a.ok]), [['direct', false], ['corsproxy.io', false], ['allorigins', true]]);
    assert.match(attempts[1].detail, /pas une image/);
  } finally {
    restore();
  }
});

test('archiveText reports every failed route', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch');
  }) as any;
  try {
    await assert.rejects(archiveText('https://search.archives.nat.tn/x'), (e: any) => e instanceof ArchiveFetchError && e.attempts.length >= 2 && e.attempts.every((a: any) => !a.ok));
  } finally {
    restore();
  }
});

test('looksLikeImage', () => {
  assert.ok(looksLikeImage(JPEG));
  assert.ok(!looksLikeImage(new TextEncoder().encode('<!doctype html>')));
});

/* ---------- parser: no invented data ---------- */

test('looksLikeAuthorLine is structural, not tied to one article', () => {
  assert.ok(looksLikeAuthorLine('Par le Docteur Mohamed SANTY'));
  assert.ok(looksLikeAuthorLine('par MM. A. DUPONT et B. MARTIN'));
  assert.ok(looksLikeAuthorLine('Par le Professeur Ahmed Ben Miled'));
  assert.ok(looksLikeAuthorLine('الدكتور أحمد بن ميلاد'));
  assert.ok(!looksLikeAuthorLine('par le chloramphénicol et la streptomycine'));
  assert.ok(!looksLikeAuthorLine('Traitement médical de la typhoïde'));
});

test('parser invents nothing when the OCR has no information', () => {
  const m = parseArticleOffline('xx\n', {});
  assert.equal(m.title, '');
  assert.equal(m.authors.length, 0);
  assert.equal(m.subjects.length, 0);
  assert.equal(m.publicationDate, '');
  assert.equal(m.issue, '');
  assert.equal(m.volume, '');
  assert.equal(m.fullWorkUrl, '');
});

test('parser: known author names are NOT silently mapped to QIDs any more', () => {
  const m = parseArticleOffline('LES HERNIES DE L\'HIATUS ŒSOPHAGIEN 21\n\nPar le Docteur Charles NICOLLE\n\nTexte du résumé.', { yearHint: 1954 });
  assert.ok(m.authors.every((a) => !a.wikidataId));
  assert.equal(m.subjects.length, 0);
  assert.equal(m.publicationDate, '1954-00-00');
});

/* ---------- Wikidata lookups (mocked API) ---------- */

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });

test('autoReconcileAuthor only answers when exactly one human matches', async () => {
  const api = (people: Record<string, string[]>) => async (u: string) => {
    if (u.includes('list=search')) return json({ query: { search: Object.keys(people).map((id) => ({ title: id })) } });
    return json({ entities: Object.fromEntries(Object.entries(people).map(([id, names]) => [id, { id, labels: { fr: { value: names[0] } }, aliases: {}, descriptions: {} }])) });
  };
  assert.deepEqual(await autoReconcileAuthor('Charles Nicolle', api({ Q1: ['Charles Nicolle'], Q2: ['Charles Nicolle Jr'] })), { id: 'Q1', label: 'Charles Nicolle' });
  assert.equal(await autoReconcileAuthor('Charles Nicolle', api({ Q1: ['Charles Nicolle'], Q3: ['Nicolle, Charles'] })), null); // ambiguous
  assert.equal(await autoReconcileAuthor('Nicolle', api({ Q1: ['Charles Nicolle'] })), null); // lone surname
  assert.equal(await autoReconcileAuthor('Jean Inconnu', api({})), null);
});

test('titleNgrams drops stop words at the edges and puts long phrases first', () => {
  const g = titleNgrams("Les hernies de l'hiatus œsophagien");
  assert.ok(g.includes('hernies de l hiatus œsophagien') || g.includes('hernies'));
  assert.ok(g.every((x) => !/^(les|de|l)\b/i.test(x)));
  assert.ok(g.indexOf('hernies') > 0 || g.length === 1);
});

test('suggestSubjects keeps only exact label matches whose description is medical', async () => {
  const f = async (u: string) => {
    const s = (new URL(u).searchParams.get('search') ?? '').toLowerCase();
    const db: Record<string, any[]> = {
      hernies: [{ id: 'QA', label: 'hernies', description: 'affection médicale', match: { type: 'label', text: 'hernies' } }],
      typhoïde: [{ id: 'QB', label: 'fièvre typhoïde', description: 'maladie infectieuse', match: { type: 'alias', text: 'typhoïde' } }],
      gabès: [{ id: 'QC', label: 'Gabès', description: 'ville de Tunisie', match: { type: 'label', text: 'Gabès' } }],
    };
    return json({ search: db[s] ?? [] });
  };
  const subs = await suggestSubjects('Hernies, typhoïde à Gabès', 'fr', f);
  assert.deepEqual(subs.map((x) => x.wikidataId).sort(), ['QA', 'QB']);
});

test('normName ignores accents, case and punctuation', () => {
  assert.equal(normName('Étienne  BURNET.'), 'etienne burnet');
});

/* ---------- volume from the queue itself ---------- */

test('volumeForYear is derived from the queue rows', async () => {
  const csv = fs.readFileSync(new URL('../../backend/data/articles.csv', import.meta.url), 'utf-8');
  globalThis.fetch = (async (u: any) => (String(u).endsWith('articles.csv') ? new Response(csv, { status: 200 }) : new Response('', { status: 404 }))) as any;
  try {
    assert.equal(await volumeForYear(1954), '32');
    assert.equal(await volumeForYear(1955), '33');
    assert.equal(await volumeForYear(1700), '');
  } finally {
    restore();
  }
});

/* ---------- GitHub Pages: works from CI-computed OCR even if the browser cannot reach the archive ---------- */

test('processArchiveUrl uses the OCR text published with the site and never needs the archive', async () => {
  const { processArchiveUrl } = await import('./pipeline.ts');
  const csv = fs.readFileSync(new URL('../../backend/data/articles.csv', import.meta.url), 'utf-8');
  const ocr = "LES HERNIES DE L'HIATUS ŒSOPHAGIEN 23\n\nPar le Docteur Mohamed SANTY\n\nTexte de l'article, avril 1954.";
  const archiveCalls: string[] = [];
  globalThis.fetch = (async (u: any) => {
    const url = String(u);
    if (url.includes('search.archives.nat.tn') || url.includes('corsproxy') || url.includes('allorigins') || url.includes('codetabs')) {
      archiveCalls.push(url);
      throw new TypeError('Failed to fetch'); // archive unreachable from the browser
    }
    if (url.endsWith('ocr-text/la-tunisie-medicale-1954/23.txt')) return new Response(ocr, { status: 200 });
    if (url.endsWith('articles.csv')) return new Response(csv, { status: 200 });
    if (url.endsWith('archive-index.json')) return new Response('{}', { status: 200 });
    if (url.includes('wikidata.org')) return new Response(JSON.stringify({ query: { search: [] }, search: [] }), { status: 200 });
    return new Response('', { status: 404 });
  }) as any;
  try {
    const r = await processArchiveUrl(DEFAULT_ARCHIVE_URL, () => undefined, () => undefined);
    assert.equal(r.ocrText, ocr);
    assert.equal(r.metadata.volume, '32'); // from the queue row
    assert.equal(r.metadata.issue, '4');
    assert.equal(r.metadata.firstPage, '23');
    assert.equal(r.metadata.fullWorkUrl, DEFAULT_ARCHIVE_URL);
    assert.match(r.metadata.title, /hernies/i);
    assert.ok(r.metadata.authors.some((a) => /santy/i.test(a.name)));
  } finally {
    restore();
  }
});
