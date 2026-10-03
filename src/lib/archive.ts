/**
 * Resolves an archive reader URL (…/Lecteur_des_archives/<volume>#page/<n>/…) to the scanned page image.
 *
 * Nothing is hardcoded: the list of page images of a volume is read from the reader page of that volume at the
 * moment it is needed (see archiveFetch.ts for how the archive is reached), then cached in the browser.
 * public/archive-index.json, when it contains the volume, is only a warm cache that saves one request.
 */
import { assetUrl } from '../api';
import { ARCHIVE_ORIGIN, Attempt, ArchiveFetchError, archiveImage, archiveText, describeAttempts } from './archiveFetch';

export interface VolumeEntry {
  folder: string;
  files: string[];
}

const norm = (v: string) => v.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Folder name of a volume in public/ocr-text/ (same rule as scripts/ocr-batch.mjs). */
export const volumeSlug = (v: string) =>
  norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const readerUrl = (volume: string) => `${ARCHIVE_ORIGIN}/fr/ANTthekira/Lecteur_des_archives/${encodeURIComponent(volume)}`;

export function parseReaderUrl(url: string): { volume: string; page: number } | null {
  const vol = url.match(/Lecteur_des_archives\/([^#/?]+)/i);
  const page = url.match(/#page\/(\d+)/i);
  if (!vol) return null;
  let volume = vol[1];
  try {
    volume = decodeURIComponent(volume);
  } catch {
    /* keep raw */
  }
  return { volume: volume.replace(/\+/g, ' ').trim(), page: page ? parseInt(page[1], 10) : 1 };
}

/* ---------- reading the reader page ---------- */

const IMAGE_EXT = /\.(?:jpe?g|png|webp|tiff?|gif)$/i;
const naturalSort = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

function toFileList(v: unknown): string[] | null {
  let x: unknown = v;
  for (let i = 0; i < 3 && typeof x === 'string'; i++) {
    try {
      x = JSON.parse(x);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(x)) {
    if (x && typeof x === 'object') x = Object.values(x as Record<string, unknown>);
    else return null;
  }
  const names = (x as unknown[])
    .map((e) => (typeof e === 'string' ? e : e && typeof e === 'object' ? ((e as any).name ?? (e as any).file ?? (e as any).src ?? '') : ''))
    .map((s) => String(s).split('/').pop() || '')
    .filter(Boolean);
  const images = names.filter((n) => IMAGE_EXT.test(n));
  return (images.length ? images : names).length ? (images.length ? images : names) : null;
}

/** Extracts the image folder and the ordered page files from the HTML of a reader page. Pure: unit-testable. */
export function parseReaderHtml(html: string, volume: string): VolumeEntry | null {
  // folder: explicit variable, else the folder of the PDF / image links of the page
  let folder =
    html.match(/(?:var|let|const)\s+folder\s*=\s*(['"])(.*?)\1/)?.[2] ??
    html.match(/uploads\/([^"'<>?#]+?)\/(?:ant-archive\.pdf|[^/"'<>?#]+\.(?:jpe?g|png|webp|tiff?))/i)?.[1];
  if (folder) {
    try {
      folder = decodeURIComponent(folder);
    } catch {
      /* keep raw */
    }
  }

  let files: string[] | null = null;
  // 1. `var files=<json>` (possibly a JSON string that holds JSON), followed by files=JSON.parse(files)
  const decl = html.match(/(?:var|let|const)\s+files\s*=\s*/);
  if (decl && decl.index !== undefined) {
    const start = decl.index + decl[0].length;
    const parseTill = html.indexOf('files=JSON.parse(files)', start);
    const chunk = parseTill !== -1 ? html.slice(start, parseTill) : html.slice(start, html.indexOf('\n', start) === -1 ? undefined : html.indexOf('\n', start));
    const body = chunk.trim().replace(/;\s*$/, '');
    const single = body.match(/^'([\s\S]*)'$/); // a single-quoted JS string holding the JSON
    try {
      files = toFileList(single ? single[1] : JSON.parse(body));
    } catch {
      const arr = body.match(/^\[[\s\S]*\]/);
      if (arr) files = toFileList(arr[0]);
    }
  }
  // 2. any image of the uploads folder mentioned in the page
  if (!files?.length) {
    const found = new Set<string>();
    for (const m of html.matchAll(/uploads\/[^"'<>?#]+?\/([^/"'<>?#]+\.(?:jpe?g|png|webp|tiff?))/gi)) {
      try {
        found.add(decodeURIComponent(m[1]));
      } catch {
        found.add(m[1]);
      }
    }
    if (found.size) files = [...found].sort(naturalSort);
  }
  if (!files?.length) return null;
  return { folder: folder || volume, files };
}

/* ---------- volume lookup (memory -> browser cache -> static cache -> reader page) ---------- */

const memory = new Map<string, VolumeEntry>();
const CACHE_PREFIX = 'tm-volume-v1:';

const readCache = (k: string): VolumeEntry | null => {
  try {
    const e = JSON.parse(localStorage.getItem(CACHE_PREFIX + k) || 'null');
    return e?.folder && Array.isArray(e.files) && e.files.length ? e : null;
  } catch {
    return null;
  }
};
const writeCache = (k: string, e: VolumeEntry) => {
  try {
    localStorage.setItem(CACHE_PREFIX + k, JSON.stringify(e));
  } catch {
    /* quota / private mode */
  }
};

let staticIndex: Promise<Record<string, VolumeEntry>> | null = null;
const loadStaticIndex = () =>
  (staticIndex ??= fetch(assetUrl('archive-index.json'))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})));

export class VolumeLookupError extends Error {
  constructor(
    message: string,
    public attempts: Attempt[],
  ) {
    super(message);
    this.name = 'VolumeLookupError';
  }
}

export async function loadVolume(volume: string, onRoute?: (route: string) => void): Promise<VolumeEntry> {
  const k = norm(volume);
  const hit = memory.get(k) ?? readCache(k);
  if (hit) return (memory.set(k, hit), hit);

  const pre = (await loadStaticIndex())[k];
  if (pre?.files?.length) return (memory.set(k, pre), writeCache(k, pre), pre);

  try {
    const { text } = await archiveText(readerUrl(volume), {
      onAttempt: onRoute,
      reject: (t) => (parseReaderHtml(t, volume) ? null : 'la page ne contient pas la liste des scans'),
    });
    const entry = parseReaderHtml(text, volume)!;
    memory.set(k, entry);
    writeCache(k, entry);
    return entry;
  } catch (e) {
    if (e instanceof ArchiveFetchError) {
      throw new VolumeLookupError(`Impossible de lire la liste des pages du volume « ${volume} » (${describeAttempts(e.attempts)}).`, e.attempts);
    }
    throw e;
  }
}

export interface ResolvedPage {
  volume: string;
  page: number;
  totalPages: number;
  fileName: string;
  imageUrl: string;
}

export async function resolveArchivePage(url: string, onRoute?: (route: string) => void): Promise<ResolvedPage> {
  const ref = parseReaderUrl(url);
  if (!ref) throw new Error("URL non reconnue : elle doit contenir « Lecteur_des_archives/<volume>#page/<n> ».");
  const entry = await loadVolume(ref.volume, onRoute);
  const i = Math.max(0, Math.min(ref.page - 1, entry.files.length - 1));
  const fileName = entry.files[i];
  return {
    volume: ref.volume,
    page: ref.page,
    totalPages: entry.files.length,
    fileName,
    imageUrl: `${ARCHIVE_ORIGIN}/uploads/${encodeURIComponent(entry.folder)}/${encodeURIComponent(fileName)}`,
  };
}

/* ---------- OCR text pre-computed by the CI (optional shortcut) ---------- */

/** OCR text pre-computed by the CI for this page, or null if it is not there (it is only a shortcut). */
export async function fetchPrecomputedOcr(volume: string, page: number): Promise<string | null> {
  try {
    const r = await fetch(assetUrl(`ocr-text/${volumeSlug(volume)}/${page}.txt`));
    if (!r.ok) return null;
    const t = await r.text();
    // GitHub Pages' 404 fallback is an HTML page: never mistake it for OCR text
    return /^\s*<!doctype html|^\s*<html/i.test(t) ? null : t;
  } catch {
    return null;
  }
}

/* ---------- the scan itself ---------- */

export class ScanUnavailableError extends Error {
  constructor(
    public imageUrl: string,
    public attempts: Attempt[],
  ) {
    super(
      `Le scan n'a pu être téléchargé par aucune route (${describeAttempts(attempts)}). ` +
        `Les Archives nationales n'autorisent probablement pas la lecture directe depuis un navigateur : configurez un proxy (voir README, « Accès aux Archives ») puis réessayez.`,
    );
    this.name = 'ScanUnavailableError';
  }
}

/** Downloads the scan so it can be OCR'd, through the routes of archiveFetch.ts. */
export async function fetchScan(imageUrl: string, onRoute?: (route: string) => void): Promise<Blob> {
  try {
    return (await archiveImage(imageUrl, { onAttempt: onRoute })).blob;
  } catch (e) {
    if (e instanceof ArchiveFetchError) throw new ScanUnavailableError(imageUrl, e.attempts);
    throw e;
  }
}
