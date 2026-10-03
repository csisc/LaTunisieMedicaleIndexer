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

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error || `HTTP ${res.status}`);
  return body as T;
}

export const getCollections = () =>
  fetch('/api/collections').then((r) => json<{ collections: CollectionSummary[]; lastSync: SyncResult | null }>(r));

export const getQueue = (p: { collection: CollectionId; q?: string; year?: number; offset?: number; limit?: number }) => {
  const qs = new URLSearchParams({ collection: p.collection });
  if (p.q) qs.set('q', p.q);
  if (p.year) qs.set('year', String(p.year));
  qs.set('offset', String(p.offset ?? 0));
  qs.set('limit', String(p.limit ?? 50));
  return fetch(`/api/articles?${qs}`).then((r) => json<{ total: number; years: number[]; items: QueueItem[] }>(r));
};

export const getNext = (collection: CollectionId, after?: string) =>
  fetch(`/api/articles/next?collection=${collection}${after ? `&after=${encodeURIComponent(after)}` : ''}`).then((r) =>
    json<{ item: QueueItem | null }>(r),
  );

export const runSync = () => fetch('/api/sync', { method: 'POST' }).then((r) => json<SyncResult>(r));

export const markCreated = (url: string, qid?: string) =>
  fetch('/api/articles/mark-created', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, qid }),
  }).then((r) => json<{ removed: number }>(r));
