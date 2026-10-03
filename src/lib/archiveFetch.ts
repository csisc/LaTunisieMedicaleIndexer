/**
 * Network access to search.archives.nat.tn from the browser.
 *
 * The archive does not necessarily send CORS headers, so a plain fetch() may be refused. Instead of giving up (and
 * asking the user to upload the scan), every request is tried through an ordered list of routes:
 *
 *   1. same-origin   `<site>/__archive/...`   (Vite dev/preview proxy, or a reverse proxy in front of the site)
 *   2. direct        straight to the archive  (works as soon as the archive allows it)
 *   3. own proxy     VITE_ARCHIVE_PROXY at build time, or localStorage `tm-archive-proxy` (see worker/cors-proxy.js)
 *   4. public proxies  best-effort fallbacks; can be switched off with localStorage `tm-archive-public-proxies` = "off"
 *
 * The route that worked last is remembered and tried first next time. Every failure is recorded so the UI can say
 * precisely what happened.
 */
import { assetUrl } from '../api';

export const ARCHIVE_ORIGIN = 'https://search.archives.nat.tn';

export interface Attempt {
  route: string;
  ok: boolean;
  detail: string;
}

export class ArchiveFetchError extends Error {
  constructor(
    message: string,
    public target: string,
    public attempts: Attempt[],
  ) {
    super(message);
    this.name = 'ArchiveFetchError';
  }
}

interface Route {
  id: string;
  /** Builds the URL to request for a given archive URL. */
  build: (archiveUrl: string) => string;
}

/** `{url}` is replaced by the encoded archive URL, `{raw}` by the URL as is. Without placeholder the encoded URL is appended. */
const fromTemplate = (tpl: string): ((u: string) => string) => {
  if (tpl.includes('{url}') || tpl.includes('{raw}')) return (u) => tpl.replace('{url}', encodeURIComponent(u)).replace('{raw}', u);
  return (u) => tpl + encodeURIComponent(u);
};

const PUBLIC_PROXIES: { id: string; tpl: string }[] = [
  { id: 'corsproxy.io', tpl: 'https://corsproxy.io/?url={url}' },
  { id: 'allorigins', tpl: 'https://api.allorigins.win/raw?url={url}' },
  { id: 'codetabs', tpl: 'https://api.codetabs.com/v1/proxy/?quest={raw}' },
];

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

const isLocalHost = () => typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export function getOwnProxy(): string {
  return (ls.get('tm-archive-proxy') || (import.meta as any).env?.VITE_ARCHIVE_PROXY || '').trim();
}
export function setOwnProxy(tpl: string) {
  ls.set('tm-archive-proxy', tpl.trim());
}
export const publicProxiesEnabled = () => ls.get('tm-archive-public-proxies') !== 'off';
export const setPublicProxiesEnabled = (on: boolean) => ls.set('tm-archive-public-proxies', on ? 'on' : 'off');

export function buildRoutes(): Route[] {
  const routes: Route[] = [];
  if (isLocalHost() || (import.meta as any).env?.VITE_ARCHIVE_SAME_ORIGIN) {
    routes.push({ id: 'same-origin', build: (u) => assetUrl('__archive/') + u.replace(ARCHIVE_ORIGIN + '/', '') });
  }
  routes.push({ id: 'direct', build: (u) => u });
  const own = getOwnProxy();
  if (own) routes.push({ id: 'own-proxy', build: fromTemplate(own) });
  if (publicProxiesEnabled()) for (const p of PUBLIC_PROXIES) routes.push({ id: p.id, build: fromTemplate(p.tpl) });

  const last = ls.get('tm-archive-last-route');
  const i = routes.findIndex((r) => r.id === last);
  if (i > 0) routes.unshift(...routes.splice(i, 1));
  return routes;
}

const IMAGE_MAGIC: [string, number[]][] = [
  ['jpeg', [0xff, 0xd8, 0xff]],
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['gif', [0x47, 0x49, 0x46]],
  ['webp', [0x52, 0x49, 0x46, 0x46]],
  ['tiff', [0x49, 0x49, 0x2a, 0x00]],
  ['tiff', [0x4d, 0x4d, 0x00, 0x2a]],
];

/** True if the bytes start like a real image (a proxy's HTML error page must never be OCR'd). */
export function looksLikeImage(bytes: Uint8Array): boolean {
  return IMAGE_MAGIC.some(([, sig]) => sig.every((b, i) => bytes[i] === b));
}

async function timedFetch(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer', signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  /** Reject a response that is not what was expected (e.g. a proxy error page). Return a reason, or null if fine. */
  reject?: (text: string) => string | null;
  onAttempt?: (route: string) => void;
}

/** GET a text resource of the archive (the reader HTML, for instance). */
export async function archiveText(url: string, opts: FetchOptions = {}): Promise<{ text: string; route: string; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  for (const route of buildRoutes()) {
    opts.onAttempt?.(route.id);
    try {
      const r = await timedFetch(route.build(url), opts.timeoutMs ?? 25_000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const why = opts.reject?.(text);
      if (why) throw new Error(why);
      attempts.push({ route: route.id, ok: true, detail: 'ok' });
      ls.set('tm-archive-last-route', route.id);
      return { text, route: route.id, attempts };
    } catch (e: any) {
      attempts.push({ route: route.id, ok: false, detail: e?.name === 'AbortError' ? 'délai dépassé' : e?.message || String(e) });
    }
  }
  throw new ArchiveFetchError(`Page des Archives nationales inaccessible : ${url}`, url, attempts);
}

/** GET an image of the archive as a Blob, checking that it really is an image. */
export async function archiveImage(url: string, opts: FetchOptions = {}): Promise<{ blob: Blob; route: string; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  for (const route of buildRoutes()) {
    opts.onAttempt?.(route.id);
    try {
      const r = await timedFetch(route.build(url), opts.timeoutMs ?? 60_000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      if (!looksLikeImage(head)) throw new Error("la réponse n'est pas une image");
      attempts.push({ route: route.id, ok: true, detail: 'ok' });
      ls.set('tm-archive-last-route', route.id);
      return { blob, route: route.id, attempts };
    } catch (e: any) {
      attempts.push({ route: route.id, ok: false, detail: e?.name === 'AbortError' ? 'délai dépassé' : e?.message || String(e) });
    }
  }
  throw new ArchiveFetchError(`Scan inaccessible : ${url}`, url, attempts);
}

export const describeAttempts = (a: Attempt[]) => a.map((x) => `${x.route}: ${x.ok ? 'ok' : x.detail}`).join(' · ');
