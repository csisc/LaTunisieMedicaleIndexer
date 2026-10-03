import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
export const ARTICLES_CSV = path.join(DATA_DIR, 'articles.csv');
export const CREATED_LOG_CSV = path.join(DATA_DIR, 'created_log.csv');

export const COLUMNS = ['source', 'year', 'volume', 'issue', 'page', 'rank', 'url', 'notes'] as const;
export const LOG_COLUMNS = ['url', 'qid', 'removed_at', 'reason'] as const;

export type CollectionId = 'before_1956' | 'main_page';

export interface PendingArticle {
  source: 'Before_1956' | 'Main_Page';
  year: number;
  volume: string;
  issue: string;
  page: string;
  rank: number;
  url: string;
  notes: string;
}

export const COLLECTIONS: Record<CollectionId, { source: PendingArticle['source']; label: string; metaWikiUrl: string }> = {
  before_1956: {
    source: 'Before_1956',
    label: 'Avant 1956',
    metaWikiUrl:
      'https://meta.wikimedia.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation/Before_1956',
  },
  main_page: {
    source: 'Main_Page',
    label: 'Page principale (1956–2008)',
    metaWikiUrl: 'https://meta.wikimedia.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation',
  },
};

/* ---------- Minimal RFC 4180 CSV ---------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: readonly string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

function writeAtomic(file: string, content: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, file);
}

/* ---------- Identity of a page in the archive reader ---------- */

/**
 * Canonical key for an archive reader URL: "<volume name lowercased>|<page>".
 * Immune to http/https, %20 vs spaces, the "/mode/2up" suffix, and trailing blanks, so a
 * Wikidata P953 value matches the CSV row even if it was typed slightly differently.
 */
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

/* ---------- Store ---------- */

export class ArticleStore {
  private rows: PendingArticle[] = [];
  private byKey = new Map<string, PendingArticle[]>();

  constructor() {
    this.load();
  }

  load() {
    this.rows = [];
    if (!fs.existsSync(ARTICLES_CSV)) {
      console.warn(`[csv] ${ARTICLES_CSV} not found; queue is empty`);
      this.reindex();
      return;
    }
    const [header, ...data] = parseCsv(fs.readFileSync(ARTICLES_CSV, 'utf-8'));
    const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
    for (const r of data) {
      const g = (k: string) => (idx[k] === undefined ? '' : (r[idx[k]] ?? '').trim());
      if (!g('url')) continue;
      this.rows.push({
        source: g('source') === 'Main_Page' ? 'Main_Page' : 'Before_1956',
        year: parseInt(g('year'), 10) || 0,
        volume: g('volume'),
        issue: g('issue'),
        page: g('page'),
        rank: parseInt(g('rank'), 10) || 0,
        url: g('url'),
        notes: g('notes'),
      });
    }
    this.reindex();
  }

  private reindex() {
    this.byKey.clear();
    for (const r of this.rows) {
      const k = pageKey(r.url);
      if (k) this.byKey.set(k, [...(this.byKey.get(k) ?? []), r]);
    }
  }

  private save() {
    writeAtomic(
      ARTICLES_CSV,
      toCsv(
        COLUMNS,
        this.rows.map((r) => COLUMNS.map((c) => r[c])),
      ),
    );
  }

  private appendLog(entries: { url: string; qid: string; reason: string }[]) {
    if (!entries.length) return;
    const exists = fs.existsSync(CREATED_LOG_CSV);
    const now = new Date().toISOString();
    const body = toCsv(
      LOG_COLUMNS,
      entries.map((e) => [e.url, e.qid, now, e.reason]),
    );
    // drop header when appending
    fs.appendFileSync(CREATED_LOG_CSV, exists ? body.split('\n').slice(1).join('\n') : body, 'utf-8');
  }

  /**
   * What the log already accounts for, per page key: QIDs already removed, and removals logged
   * without a QID (manual "created" clicks). Used so a Wikidata item never removes a second row.
   */
  logged(): Map<string, { qids: Set<string>; anonymous: number }> {
    const out = new Map<string, { qids: Set<string>; anonymous: number }>();
    if (!fs.existsSync(CREATED_LOG_CSV)) return out;
    const [header, ...data] = parseCsv(fs.readFileSync(CREATED_LOG_CSV, 'utf-8'));
    const iu = header.indexOf('url');
    const iq = header.indexOf('qid');
    for (const r of data) {
      const k = pageKey(r[iu] ?? '');
      if (!k) continue;
      const e = out.get(k) ?? { qids: new Set<string>(), anonymous: 0 };
      if (r[iq]) e.qids.add(r[iq]);
      else e.anonymous++;
      out.set(k, e);
    }
    return out;
  }

  findByUrl(url: string): PendingArticle | null {
    const k = pageKey(url);
    return k ? (this.byKey.get(k)?.[0] ?? null) : this.rows.find((r) => r.url === url) ?? null;
  }

  /**
   * URL of the article that follows `url` in the same volume, for the end-page formula.
   * Looks at pending rows AND rows already removed (created on Wikidata): a finished neighbour
   * still marks where this article stops. If another article starts on this very page, it is the next one.
   */
  nextArticleUrl(url: string): string | null {
    const k = pageKey(url);
    if (!k) return null;
    const [vol, pageStr] = k.split('|');
    const page = parseInt(pageStr, 10);
    if (this.byKey.get(k)!?.length > 1) return this.byKey.get(k)![1].url;
    let best: { page: number; url: string } | null = null;
    const consider = (u: string) => {
      const kk = pageKey(u);
      if (!kk) return;
      const [v, p] = kk.split('|');
      const n = parseInt(p, 10);
      if (v === vol && n > page && (!best || n < best.page)) best = { page: n, url: u };
    };
    this.rows.forEach((r) => consider(r.url));
    if (fs.existsSync(CREATED_LOG_CSV)) {
      const [header, ...data] = parseCsv(fs.readFileSync(CREATED_LOG_CSV, 'utf-8'));
      const iu = header.indexOf('url');
      data.forEach((r) => consider(r[iu] ?? ''));
    }
    return (best as any)?.url ?? null;
  }

  /** Pending articles per page key (a page can start several articles, hence several rows). */
  counts(): Map<string, number> {
    return new Map([...this.byKey].map(([k, v]) => [k, v.length]));
  }

  size(): number {
    return this.rows.length;
  }

  summary() {
    const out = {} as Record<CollectionId, { id: CollectionId; label: string; metaWikiUrl: string; remaining: number; minYear: number | null; maxYear: number | null }>;
    for (const [id, meta] of Object.entries(COLLECTIONS) as [CollectionId, (typeof COLLECTIONS)[CollectionId]][]) {
      const rows = this.rows.filter((r) => r.source === meta.source);
      const years = rows.map((r) => r.year).filter(Boolean);
      out[id] = {
        id,
        label: meta.label,
        metaWikiUrl: meta.metaWikiUrl,
        remaining: rows.length,
        minYear: years.length ? Math.min(...years) : null,
        maxYear: years.length ? Math.max(...years) : null,
      };
    }
    return out;
  }

  list(opts: { collection: CollectionId; q?: string; year?: number; offset?: number; limit?: number }) {
    const source = COLLECTIONS[opts.collection].source;
    const q = (opts.q || '').trim().toLowerCase();
    let rows = this.rows.filter((r) => r.source === source);
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
    if (opts.year) rows = rows.filter((r) => r.year === opts.year);
    if (q) {
      rows = rows.filter((r) =>
        `${r.year} p.${r.page} ${r.page} vol ${r.volume} n ${r.issue} ${r.notes}`.toLowerCase().includes(q),
      );
    }
    const offset = Math.max(0, opts.offset || 0);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const items = rows
      .slice(offset, offset + limit)
      .map((r) => ({ ...r, articlesOnPage: this.byKey.get(pageKey(r.url) ?? '')?.length ?? 1 }));
    return { total: rows.length, years, items };
  }

  /** Next pending row after the given page (skips other articles of that same page). */
  next(collection: CollectionId, afterUrl?: string): PendingArticle | null {
    const rows = this.rows.filter((r) => r.source === COLLECTIONS[collection].source);
    if (!afterUrl) return rows[0] ?? null;
    const k = pageKey(afterUrl);
    let last = -1;
    rows.forEach((r, i) => {
      if (pageKey(r.url) === k) last = i;
    });
    if (last === -1) return rows[0] ?? null;
    return rows.slice(last + 1).find((r) => pageKey(r.url) !== k) ?? null;
  }

  /**
   * Remove pending rows. Each entry removes `count` rows (default 1) of that page, earliest first,
   * because one page can hold several articles and only some of them may exist on Wikidata.
   * `qids` are logged one per removed row.
   */
  remove(items: { keyOrUrl: string; qids?: string[]; count?: number }[], reason: string): PendingArticle[] {
    const removed: PendingArticle[] = [];
    const logEntries: { url: string; qid: string; reason: string }[] = [];
    const drop = new Set<PendingArticle>();
    for (const it of items) {
      const k = pageKey(it.keyOrUrl) ?? it.keyOrUrl;
      const candidates = this.rows.filter((r) => (pageKey(r.url) ?? r.url) === k && !drop.has(r));
      const n = Math.min(it.count ?? 1, candidates.length);
      for (let i = 0; i < n; i++) {
        drop.add(candidates[i]);
        removed.push(candidates[i]);
        logEntries.push({ url: candidates[i].url, qid: it.qids?.[i] ?? '', reason });
      }
    }
    if (!removed.length) return [];
    this.rows = this.rows.filter((r) => !drop.has(r));
    this.reindex();
    this.save();
    this.appendLog(logEntries);
    return removed;
  }
}

export const store = new ArticleStore();
