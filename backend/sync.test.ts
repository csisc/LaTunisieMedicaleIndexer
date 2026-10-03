import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Work on a throw-away copy of the real CSV so the test never touches production data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'));
fs.copyFileSync(path.join(import.meta.dirname, 'data', 'articles.csv'), path.join(tmp, 'articles.csv'));
process.env.DATA_DIR = tmp;

const { store, pageKey, parseCsv } = await import('./csvStore.ts');
const { syncWithWikidata } = await import('./wikidataSync.ts');

const sparql = (rows: [string, string][]) =>
  ({ ok: true, status: 200, json: async () => ({ results: { bindings: rows.map(([q, u]) => ({ item: { value: `http://www.wikidata.org/entity/${q}` }, url: { value: u } })) } }) }) as Response;

test('pageKey ignores scheme encoding and mode suffix', () => {
  const a = pageKey('https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/9/mode/2up');
  const b = pageKey('http://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La Tunisie Medicale-1954#page/9');
  assert.equal(a, b);
  assert.equal(pageKey('https://example.org/x'), null);
});

test('CSV keeps repeated URLs (several articles per page)', () => {
  const s = store.summary();
  assert.equal(s.before_1956.remaining, 1930);
  assert.equal(s.main_page.remaining, 200);
  assert.ok([...store.counts().values()].some((n) => n > 1));
});

test('one Wikidata item removes only one of two articles on the same page', async () => {
  const [key] = [...store.counts()].find(([, n]) => n === 2)!;
  const url = parseCsv(fs.readFileSync(path.join(tmp, 'articles.csv'), 'utf-8')).map((r) => r[6]).find((u) => pageKey(u) === key)!;
  const before = store.size();
  const r = await syncWithWikidata((async () => sparql([['Q7', url]])) as any);
  assert.equal(r.removed, 1);
  assert.equal(store.size(), before - 1);
  assert.equal(store.counts().get(key), 1);
  const r2 = await syncWithWikidata((async () => sparql([['Q7', url], ['Q8', url]])) as any);
  assert.equal(r2.removed, 1); // Q7 was already accounted for: only Q8 is new
  assert.equal(store.counts().get(key), undefined);
  assert.equal((await syncWithWikidata((async () => sparql([['Q7', url], ['Q8', url]])) as any)).removed, 0);
});

test('failed Wikidata query leaves the CSV untouched', async () => {
  const before = fs.readFileSync(path.join(tmp, 'articles.csv'), 'utf-8');
  const r = await syncWithWikidata((async () => ({ ok: false, status: 504 }) as Response) as any);
  assert.equal(r.ok, false);
  assert.equal(fs.readFileSync(path.join(tmp, 'articles.csv'), 'utf-8'), before);
});

test('created pages are removed, logged, and the rest kept', async () => {
  const first = store.list({ collection: 'before_1956', limit: 1 }).items[0];
  const main = store.list({ collection: 'main_page', limit: 1 }).items[0];
  const total = store.size();
  const r = await syncWithWikidata((async () =>
    sparql([
      ['Q111', first.url.replace('https://', 'http://').replace(/%20/g, ' ')],
      ['Q222', main.url],
      ['Q333', 'https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/Nope-1800#page/1/mode/2up'],
    ])) as any);
  assert.equal(r.ok, true);
  assert.equal(r.removed, 2);
  assert.equal(store.size(), total - 2);
  // persisted
  const rows = parseCsv(fs.readFileSync(path.join(tmp, 'articles.csv'), 'utf-8'));
  assert.equal(rows.length - 1, total - 2);
  const log = parseCsv(fs.readFileSync(path.join(tmp, 'created_log.csv'), 'utf-8'));
  assert.ok(log.some((l) => l[1] === 'Q111') && log.some((l) => l[1] === 'Q222'));
  // idempotent
  assert.equal((await syncWithWikidata((async () => sparql([['Q111', first.url]])) as any)).removed, 0);
});

test('mark-created removes a single page', () => {
  const it = store.list({ collection: 'before_1956', limit: 1 }).items[0];
  assert.equal(store.remove([{ keyOrUrl: it.url, qid: 'Q9' }], 'marked created by user').length, 1);
  assert.equal(store.findByUrl(it.url), null);
});

test('end page formula: first + (next URL page - this URL page), counting neighbours already on Wikidata', async () => {
  const { deriveLastPageFromUrls } = await import('../src/utils/offlineParser.ts');
  const u = (n: number) => `https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/${n}/mode/2up`;
  assert.deepEqual(deriveLastPageFromUrls('9', u(9), u(15)), { lastPage: '15', pageRange: '9-15', formula: '9 + (15 - 9) = 15' });
  assert.equal(deriveLastPageFromUrls('', u(9), u(15)), null);
  assert.equal(deriveLastPageFromUrls('9', u(9), undefined), null);
  // 1954: pending pages 9, 15, 23, 45... ; 15 is removed (created) but must still bound page 9
  {
    assert.equal(store.nextArticleUrl(u(9)), u(15));
    store.remove([{ keyOrUrl: u(15), qids: ['Q15'] }], 'test');
    assert.equal(store.nextArticleUrl(u(9)), u(15));
  }
  assert.equal(store.nextArticleUrl('https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/9999/mode/2up'), null);
});
