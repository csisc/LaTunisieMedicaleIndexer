// Empty = same origin (npm run dev). On GitHub Pages set VITE_API_BASE to the URL of the Node backend.
export const API_BASE: string = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '');
export const apiUrl = (path: string) => (path.startsWith('/') ? API_BASE + path : path);

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

const f = (path: string, init?: RequestInit) => fetch(apiUrl(path), init);

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error || `HTTP ${res.status}`);
  return body as T;
}

/* ---------- Static mode ----------
 * On GitHub Pages there is no Node backend: the queue is read straight from articles.csv, which the Pages
 * workflow publishes next to index.html. Lists, search and navigation work; OCR needs the backend.
 */
const WIKI_BASE = 'https://meta.wikimedia.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation';
const META: Record<CollectionId, { source: QueueItem['source']; label: string; metaWikiUrl: string }> = {
  before_1956: { source: 'Before_1956', label: 'Avant 1956', metaWikiUrl: `${WIKI_BASE}/Before_1956` },
  main_page: { source: 'Main_Page', label: 'Page principale (1956–2008)', metaWikiUrl: WIKI_BASE },
};

let staticRows: Promise<QueueItem[]> | null = null;
let removedLocally = new Set<QueueItem>();

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++;
        else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));
  return rows;
}

const loadStatic = () =>
  (staticRows ??= fetch(((import.meta as any).env?.BASE_URL || '/') + 'articles.csv')
    .then((r) => {
      if (!r.ok) throw new Error(`articles.csv introuvable (HTTP ${r.status}). Le backend n'est pas configuré non plus.`);
      return r.text();
    })
    .then((t) => {
      const [h, ...d] = parseCsv(t);
      const ix = Object.fromEntries(h.map((x, i) => [x.trim(), i]));
      return d.map((r) => ({
        source: r[ix.source] === 'Main_Page' ? 'Main_Page' : 'Before_1956',
        year: parseInt(r[ix.year], 10) || 0,
        volume: r[ix.volume] ?? '',
        issue: r[ix.issue] ?? '',
        page: r[ix.page] ?? '',
        rank: parseInt(r[ix.rank], 10) || 0,
        url: r[ix.url] ?? '',
        notes: r[ix.notes] ?? '',
      })) as QueueItem[];
    })
    .catch((e) => {
      staticRows = null;
      throw e;
    }));

const pageId = (u: string) => {
  const m = u.match(/Lecteur_des_archives\/([^#?]+).*?page\/(\d+)/i);
  return m ? `${decodeURIComponent(m[1]).toLowerCase()}|${m[2]}` : u;
};
const pending = async (c: CollectionId) =>
  (await loadStatic()).filter((r) => r.source === META[c].source && !removedLocally.has(r));

/** Use the backend when it answers; fall back to the static CSV when there is none (HTTP 404 / network error). */
async function withFallback<T>(api: () => Promise<T>, local: () => Promise<T>): Promise<T> {
  try {
    return await api();
  } catch (e: any) {
    if (e instanceof TypeError || /^HTTP (404|405)$/.test(e?.message || '')) return local();
    throw e;
  }
}

export const getCollections = () =>
  withFallback(
    () => f('/api/collections').then((r) => json<{ collections: CollectionSummary[]; lastSync: SyncResult | null }>(r)),
    async () => ({
      lastSync: null,
      collections: await Promise.all(
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
      ),
    }),
  );

export const getQueue = (p: { collection: CollectionId; q?: string; year?: number; offset?: number; limit?: number }) => {
  const qs = new URLSearchParams({ collection: p.collection });
  if (p.q) qs.set('q', p.q);
  if (p.year) qs.set('year', String(p.year));
  qs.set('offset', String(p.offset ?? 0));
  qs.set('limit', String(p.limit ?? 50));
  return withFallback(
    () => f(`/api/articles?${qs}`).then((r) => json<{ total: number; years: number[]; items: QueueItem[] }>(r)),
    async () => {
      let rows = await pending(p.collection);
      const counts = new Map<string, number>();
      rows.forEach((r) => counts.set(pageId(r.url), (counts.get(pageId(r.url)) ?? 0) + 1));
      const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
      const q = (p.q || '').trim().toLowerCase();
      if (p.year) rows = rows.filter((r) => r.year === p.year);
      if (q) rows = rows.filter((r) => `${r.year} p.${r.page} vol ${r.volume} n ${r.issue} ${r.notes}`.toLowerCase().includes(q));
      const off = p.offset ?? 0;
      return {
        total: rows.length,
        years,
        items: rows.slice(off, off + (p.limit ?? 50)).map((r) => ({ ...r, articlesOnPage: counts.get(pageId(r.url)) ?? 1 })),
      };
    },
  );
};

export const getNext = (collection: CollectionId, after?: string) =>
  withFallback(
    () =>
      f(`/api/articles/next?collection=${collection}${after ? `&after=${encodeURIComponent(after)}` : ''}`).then((r) =>
        json<{ item: QueueItem | null }>(r),
      ),
    async () => {
      const rows = await pending(collection);
      if (!after) return { item: rows[0] ?? null };
      const k = pageId(after);
      let last = -1;
      rows.forEach((r, i) => pageId(r.url) === k && (last = i));
      return { item: rows.slice(last + 1).find((r) => pageId(r.url) !== k) ?? (last === -1 ? rows[0] : null) ?? null };
    },
  );

export const runSync = () =>
  withFallback(
    () => f('/api/sync', { method: 'POST' }).then((r) => json<SyncResult>(r)),
    async () => {
      throw new Error(
        "Pas de backend : la synchronisation est faite par l'action GitHub « Sync work queue with Wikidata » (onglet Actions du dépôt).",
      );
    },
  );

export const markCreated = (url: string, qid?: string) =>
  withFallback(
    () =>
      f('/api/articles/mark-created', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, qid }),
      }).then((r) => json<{ removed: number }>(r)),
    async () => {
      // Session only: hides one row until reload. The permanent removal comes from the scheduled sync.
      const row = (await loadStatic()).find((r) => !removedLocally.has(r) && pageId(r.url) === pageId(url));
      if (row) removedLocally.add(row);
      return { removed: row ? 1 : 0 };
    },
  );
