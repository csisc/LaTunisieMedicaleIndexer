/**
 * Static data layer (GitHub Pages): there is no server.
 *
 * - The work queue is `articles.csv`, published next to index.html by the build (copy of backend/data/articles.csv).
 * - `created_log.csv` (same folder) lists the pages already removed because they exist on Wikidata.
 * - A GitHub Action keeps both files up to date (see .github/workflows/sync-csv.yml).
 * - Changes made in the browser ("Créé · page suivante", "Synchroniser") are kept in localStorage, per browser,
 *   on top of the published CSV, and are reconciled automatically when the published CSV catches up.
 */
const BASE: string = (import.meta as any).env?.BASE_URL || '/';
export const assetUrl = (p: string) => BASE + p.replace(/^\//, '');

export type CollectionId = 'before_1956' | 'main_page';

export interface CollectionSummary {
  id: CollectionId;
  label: string;
  metaWikiUrl: string;
  remaining: number;
  minYear: number | null;
  maxYear: number | null;
}

export interface SyncResult {
  ok: boolean;
  finishedAt: string;
  wikidataItems: number;
  removed: number;
  remaining: number;
  error?: string;
}

export interface QueueItem {
  source: 'Before_1956' | 'Main_Page';
  year: number;
  volume: string;
  issue: string;
  page: string;
  rank: number;
  url: string;
  notes: string;
  articlesOnPage?: number;
}

const WIKI_BASE = 'https://meta.wikimedia.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation';
const META: Record<CollectionId, { source: QueueItem['source']; label: string; metaWikiUrl: string }> = {
  before_1956: { source: 'Before_1956', label: 'Avant 1956', metaWikiUrl: `${WIKI_BASE}/Before_1956` },
  main_page: { source: 'Main_Page', label: 'Page principale (1956–2008)', metaWikiUrl: WIKI_BASE },
};

/* ---------- CSV ---------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') (cell += '"'), i++;
        else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));
  return rows;
}

/** Canonical identity of an archive reader URL: "<volume lowercased>|<page>" (same rule as backend/csvStore.ts). */
export function pageKey(rawUrl: string): string | null {
  const m = rawUrl.match(/Lecteur_des_archives\/([^#?]+)(?:[#?].*?page\/(\d+))?/i);
  if (!m || !m[2]) return null;
  let vol = m[1];
  try {
    vol = decodeURIComponent(vol);
  } catch {
    /* keep raw */
  }
  return `${vol.replace(/\/+$/, '').replace(/\+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()}|${parseInt(m[2], 10)}`;
}
const keyOf = (u: string) => pageKey(u) ?? u;

/* ---------- Published files ---------- */

interface LogRow {
  url: string;
  qid: string;
}

let rawRows: Promise<QueueItem[]> | null = null;
let logRows: Promise<LogRow[]> | null = null;

async function fetchText(file: string): Promise<string> {
  const r = await fetch(assetUrl(file), { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${file} introuvable (HTTP ${r.status})`);
  return r.text();
}

const loadRows = () =>
  (rawRows ??= fetchText('articles.csv')
    .then((t) => {
      const [h, ...d] = parseCsv(t);
      const ix = Object.fromEntries(h.map((x, i) => [x.trim(), i]));
      return d
        .filter((r) => (r[ix.url] ?? '').trim())
        .map((r) => ({
          source: r[ix.source] === 'Main_Page' ? 'Main_Page' : 'Before_1956',
          year: parseInt(r[ix.year], 10) || 0,
          volume: (r[ix.volume] ?? '').trim(),
          issue: (r[ix.issue] ?? '').trim(),
          page: (r[ix.page] ?? '').trim(),
          rank: parseInt(r[ix.rank], 10) || 0,
          url: (r[ix.url] ?? '').trim(),
          notes: (r[ix.notes] ?? '').trim(),
        })) as QueueItem[];
    })
    .catch((e) => {
      rawRows = null;
      throw e;
    }));

const loadLog = () =>
  (logRows ??= fetchText('created_log.csv')
    .then((t) => {
      const [h, ...d] = parseCsv(t);
      const iu = h.indexOf('url');
      const iq = h.indexOf('qid');
      return d.map((r) => ({ url: r[iu] ?? '', qid: r[iq] ?? '' }));
    })
    .catch(() => [] as LogRow[])); // the log is optional

/* ---------- Local state (this browser only) ---------- */

interface LocalState {
  /** Marked "created" by hand: QIDs (if given) and anonymous marks, with the raw row count when marked. */
  manual: Record<string, { qids: string[]; anon: number; rows: number }>;
  /** Result of the last in-browser Wikidata sync: fresh QIDs per page. */
  wd: Record<string, { qids: string[]; rows: number }>;
  lastSync: SyncResult | null;
}

const LS_KEY = 'tm-indexer-state-v1';
const emptyState = (): LocalState => ({ manual: {}, wd: {}, lastSync: null });
let state: LocalState | null = null;

function readState(): LocalState {
  if (state) return state;
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    state = s && s.manual && s.wd ? s : emptyState();
  } catch {
    state = emptyState();
  }
  return state!;
}
function writeState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota: keep working in memory */
  }
}

let reconciled = false;
/** Drop local marks that the published CSV already reflects (a QID in the log, or fewer rows than when marked). */
async function reconcile() {
  if (reconciled) return;
  const [rows, log] = await Promise.all([loadRows(), loadLog()]);
  const s = readState();
  const count = new Map<string, number>();
  rows.forEach((r) => count.set(keyOf(r.url), (count.get(keyOf(r.url)) ?? 0) + 1));
  const logged = new Set(log.map((l) => `${keyOf(l.url)}|${l.qid}`));
  for (const [k, m] of Object.entries(s.manual)) {
    m.qids = m.qids.filter((q) => !logged.has(`${k}|${q}`));
    const gone = Math.max(0, m.rows - (count.get(k) ?? 0));
    m.anon = Math.max(0, m.anon - gone);
    m.rows = count.get(k) ?? 0;
    if (!m.qids.length && !m.anon) delete s.manual[k];
  }
  for (const [k, w] of Object.entries(s.wd)) {
    w.qids = w.qids.filter((q) => !logged.has(`${k}|${q}`));
    if (!w.qids.length) delete s.wd[k];
    else w.rows = count.get(k) ?? 0;
  }
  writeState();
  reconciled = true;
}

function hiddenCount(k: string): number {
  const s = readState();
  const m = s.manual[k] ?? { qids: [], anon: 0 };
  const w = s.wd[k]?.qids ?? [];
  const all = new Set([...m.qids, ...w]);
  const wdOnly = w.filter((q) => !m.qids.includes(q)).length;
  return all.size + Math.max(0, m.anon - wdOnly);
}

/** Pending rows of a collection: published CSV minus what this browser has already marked or synced. */
async function pending(c?: CollectionId): Promise<QueueItem[]> {
  const rows = await loadRows();
  await reconcile();
  const skipped = new Map<string, number>();
  return rows.filter((r) => {
    if (c && r.source !== META[c].source) return false;
    const k = keyOf(r.url);
    const done = skipped.get(k) ?? 0;
    if (done < hiddenCount(k)) {
      skipped.set(k, done + 1);
      return false;
    }
    return true;
  });
}

/* ---------- Public API ---------- */

export const getCollections = async () => {
  const collections: CollectionSummary[] = await Promise.all(
    (Object.keys(META) as CollectionId[]).map(async (id) => {
      const rows = await pending(id);
      const years = rows.map((r) => r.year).filter(Boolean);
      return {
        id,
        label: META[id].label,
        metaWikiUrl: META[id].metaWikiUrl,
        remaining: rows.length,
        minYear: years.length ? Math.min(...years) : null,
        maxYear: years.length ? Math.max(...years) : null,
      };
    }),
  );
  return { collections, lastSync: readState().lastSync };
};

export const getQueue = async (p: { collection: CollectionId; q?: string; year?: number; offset?: number; limit?: number }) => {
  let rows = await pending(p.collection);
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(keyOf(r.url), (counts.get(keyOf(r.url)) ?? 0) + 1));
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const q = (p.q || '').trim().toLowerCase();
  if (p.year) rows = rows.filter((r) => r.year === p.year);
  if (q) rows = rows.filter((r) => `${r.year} p.${r.page} ${r.page} vol ${r.volume} n ${r.issue} ${r.notes}`.toLowerCase().includes(q));
  const off = Math.max(0, p.offset ?? 0);
  const limit = Math.min(200, Math.max(1, p.limit ?? 50));
  return {
    total: rows.length,
    years,
    items: rows.slice(off, off + limit).map((r) => ({ ...r, articlesOnPage: counts.get(keyOf(r.url)) ?? 1 })),
  };
};

export const getNext = async (collection: CollectionId, after?: string): Promise<{ item: QueueItem | null }> => {
  const rows = await pending(collection);
  if (!after) return { item: rows[0] ?? null };
  const k = keyOf(after);
  let last = -1;
  rows.forEach((r, i) => keyOf(r.url) === k && (last = i));
  if (last === -1) return { item: rows[0] ?? null };
  return { item: rows.slice(last + 1).find((r) => keyOf(r.url) !== k) ?? null };
};

/** The queue row (if any) describing this archive page: gives year / volume / issue hints. */
export async function findRow(url: string): Promise<QueueItem | null> {
  const k = keyOf(url);
  return (await loadRows()).find((r) => keyOf(r.url) === k) ?? null;
}

/**
 * Volume number of a year, read from the work queue itself (rows that carry both): the most frequent volume of that
 * year, else the year-volume offset of the closest year that has one. Returns '' when the queue knows nothing.
 */
export async function volumeForYear(year: number): Promise<string> {
  if (!year) return '';
  const byYear = new Map<number, Map<number, number>>();
  for (const r of await loadRows()) {
    const v = parseInt(r.volume, 10);
    if (!r.year || !v) continue;
    const m = byYear.get(r.year) ?? new Map<number, number>();
    m.set(v, (m.get(v) ?? 0) + 1);
    byYear.set(r.year, m);
  }
  const top = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const exact = byYear.get(year);
  if (exact) return String(top(exact));
  const near = [...byYear.keys()].sort((a, b) => Math.abs(a - year) - Math.abs(b - year))[0];
  if (near === undefined || Math.abs(near - year) > 3) return '';
  return String(top(byYear.get(near)!) + (year - near));
}

/**
 * URL of the article that follows `url` in the same volume (for the end-page formula). Looks at the whole
 * published queue AND the log of already-created pages: a finished neighbour still marks where this article stops.
 * If another article starts on the very same page, that one is the next.
 */
export async function nextArticleUrl(url: string): Promise<string | null> {
  const k = pageKey(url);
  if (!k) return null;
  const [vol, pageStr] = k.split('|');
  const page = parseInt(pageStr, 10);
  const [rows, log] = await Promise.all([loadRows(), loadLog()]);
  const same = rows.filter((r) => pageKey(r.url) === k);
  if (same.length > 1) return same[1].url;
  let best: { page: number; url: string } | null = null;
  for (const u of [...rows.map((r) => r.url), ...log.map((l) => l.url)]) {
    const kk = pageKey(u);
    if (!kk) continue;
    const [v, p] = kk.split('|');
    const n = parseInt(p, 10);
    if (v === vol && n > page && (!best || n < best.page)) best = { page: n, url: u };
  }
  return best?.url ?? null;
}

/** "Created · next page": hides the page in this browser right away (the CI sync removes it from the CSV later). */
export const markCreated = async (url: string, qid?: string) => {
  await reconcile();
  const k = keyOf(url);
  const rows = (await loadRows()).filter((r) => keyOf(r.url) === k);
  const s = readState();
  const m = (s.manual[k] ??= { qids: [], anon: 0, rows: rows.length });
  const before = hiddenCount(k);
  if (qid) {
    if (!m.qids.includes(qid)) m.qids.push(qid);
  } else m.anon++;
  m.rows = rows.length;
  const removed = Math.min(rows.length, hiddenCount(k)) - Math.min(rows.length, before);
  writeState();
  return { removed };
};

/* ---------- Wikidata sync, straight from the browser ---------- */

const WDQS = 'https://query.wikidata.org/sparql';
const QUERY = `SELECT ?item ?url WHERE { ?item wdt:P1433 wd:Q3213360 ; wdt:P953 ?url . FILTER(CONTAINS(STR(?url), "search.archives.nat.tn")) }`;

export const runSync = async (): Promise<SyncResult> => {
  const start = (await pending()).length;
  try {
    const [rows, log] = await Promise.all([loadRows(), loadLog()]);
    const res = await fetch(`${WDQS}?format=json&query=${encodeURIComponent(QUERY)}`, {
      headers: { Accept: 'application/sparql-results+json' },
    });
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
    const bindings = (await res.json())?.results?.bindings;
    if (!Array.isArray(bindings)) throw new Error('Réponse Wikidata inattendue');

    const created = new Map<string, string[]>();
    for (const b of bindings) {
      const k = b?.url?.value ? pageKey(b.url.value) : null;
      const qid = (b?.item?.value || '').split('/').pop() || '';
      if (!k || !qid) continue;
      const l = created.get(k) ?? [];
      if (!l.includes(qid)) l.push(qid);
      created.set(k, l);
    }

    // same rule as the CI: one Wikidata item = one article; QIDs already in the log are never counted twice
    const loggedQids = new Map<string, Set<string>>();
    const loggedAnon = new Map<string, number>();
    for (const l of log) {
      const k = keyOf(l.url);
      if (l.qid) loggedQids.set(k, (loggedQids.get(k) ?? new Set()).add(l.qid));
      else loggedAnon.set(k, (loggedAnon.get(k) ?? 0) + 1);
    }
    const rowCount = new Map<string, number>();
    rows.forEach((r) => rowCount.set(keyOf(r.url), (rowCount.get(keyOf(r.url)) ?? 0) + 1));

    const s = readState();
    s.wd = {};
    for (const [k, n] of rowCount) {
      const fresh = (created.get(k) ?? []).filter((q) => !loggedQids.get(k)?.has(q)).slice(loggedAnon.get(k) ?? 0);
      if (fresh.length) s.wd[k] = { qids: fresh.slice(0, n), rows: n };
    }
    reconciled = false;
    const remaining = (await pending()).length;
    const result: SyncResult = {
      ok: true,
      finishedAt: new Date().toISOString(),
      wikidataItems: [...created.values()].reduce((n, l) => n + l.length, 0),
      removed: Math.max(0, start - remaining),
      remaining,
    };
    s.lastSync = result;
    writeState();
    return result;
  } catch (e: any) {
    // Never modify the queue if Wikidata could not be queried
    return {
      ok: false,
      finishedAt: new Date().toISOString(),
      wikidataItems: 0,
      removed: 0,
      remaining: start,
      error: e?.message || String(e),
    };
  }
};
