import { store, pageKey } from './csvStore.ts';

const WDQS = process.env.WDQS_ENDPOINT || 'https://query.wikidata.org/sparql';
const USER_AGENT =
  'LaTunisieMedicaleTool/1.0 (https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community; contact: wikidata-arabic@wikimedia.org)';

/** Items "published in" (P1433) La Tunisie Médicale (Q3213360) that carry a "full work available at" (P953) URL. */
const QUERY = `
SELECT ?item ?url WHERE {
  ?item wdt:P1433 wd:Q3213360 ;
        wdt:P953 ?url .
  FILTER(CONTAINS(STR(?url), "search.archives.nat.tn"))
}`;

export interface SyncResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  wikidataItems: number;
  removed: number;
  remaining: number;
  removedSample: { url: string; qid: string }[];
  error?: string;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Returns pageKey -> QIDs (one per item) for every article already on Wikidata. Throws on any error (never partial). */
export async function fetchCreatedPages(fetcher: Fetcher = fetch as Fetcher): Promise<Map<string, string[]>> {
  const res = await fetcher(`${WDQS}?format=json&query=${encodeURIComponent(QUERY)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`WDQS HTTP ${res.status}`);
  const json: any = await res.json();
  const bindings = json?.results?.bindings;
  if (!Array.isArray(bindings)) throw new Error('Unexpected WDQS response shape');
  const out = new Map<string, string[]>();
  for (const b of bindings) {
    const key = b?.url?.value ? pageKey(b.url.value) : null;
    const qid = (b?.item?.value || '').split('/').pop() || '';
    if (key && qid) {
      const list = out.get(key) ?? [];
      if (!list.includes(qid)) list.push(qid);
      out.set(key, list);
    }
  }
  return out;
}

let running: Promise<SyncResult> | null = null;
let lastSync: SyncResult | null = null;
export const getLastSync = () => lastSync;

/**
 * Removes from articles.csv every page that already has a Wikidata item.
 * Safe by construction: if Wikidata cannot be queried, the CSV is left untouched.
 */
export function syncWithWikidata(fetcher?: Fetcher): Promise<SyncResult> {
  if (running) return running; // collapse concurrent runs
  running = (async () => {
    const startedAt = new Date().toISOString();
    try {
      const created = await fetchCreatedPages(fetcher);
      // One Wikidata item = one article: a page holding 2 articles with 1 item keeps 1 row in the queue.
      const logged = store.logged();
      const todo = [...store.counts().keys()].flatMap((k) => {
        const seen = logged.get(k);
        const fresh = (created.get(k) ?? []).filter((q) => !seen?.qids.has(q));
        // manual removals made without a QID are assumed to be some of these items
        const qids = fresh.slice(seen?.anonymous ?? 0);
        return qids.length ? [{ keyOrUrl: k, qids, count: qids.length }] : [];
      });
      const removed = store.remove(todo, 'found on Wikidata (P1433+P953)');
      lastSync = {
        ok: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        wikidataItems: [...created.values()].reduce((n, l) => n + l.length, 0),
        removed: removed.length,
        remaining: store.size(),
        removedSample: removed.slice(0, 10).map((r) => ({ url: r.url, qid: created.get(pageKey(r.url)!)?.[0] || '' })),
      };
    } catch (e: any) {
      lastSync = {
        ok: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        wikidataItems: 0,
        removed: 0,
        remaining: store.size(),
        removedSample: [],
        error: e?.message || String(e),
      };
    }
    return lastSync!;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Runs a sync at start-up and then every SYNC_INTERVAL_HOURS (default 6; 0 disables). */
export function startSyncScheduler() {
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? 6);
  if (!hours || hours <= 0) {
    console.log('[sync] scheduler disabled (SYNC_INTERVAL_HOURS=0)');
    return;
  }
  const run = () =>
    syncWithWikidata().then((r) =>
      console.log(r.ok ? `[sync] removed ${r.removed}, ${r.remaining} remaining` : `[sync] failed: ${r.error}`),
    );
  if (process.env.SYNC_ON_START !== 'false') setTimeout(run, 3000);
  setInterval(run, hours * 3600_000).unref();
}
