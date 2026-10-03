/**
 * Resolves an archive reader URL to the scanned page image.
 *
 * The reader page itself cannot be read from a browser (cross-origin), so the list of page images of every volume
 * is collected at build time by scripts/build-archive-index.mjs and published as /archive-index.json.
 */
import { assetUrl } from '../api';

interface VolumeEntry {
  folder: string;
  files: string[];
}
type ArchiveIndex = Record<string, VolumeEntry>;

let indexPromise: Promise<ArchiveIndex> | null = null;
const loadIndex = () =>
  (indexPromise ??= fetch(assetUrl('archive-index.json'))
    .then((r) => {
      if (!r.ok) throw new Error(`archive-index.json introuvable (HTTP ${r.status})`);
      return r.json() as Promise<ArchiveIndex>;
    })
    .catch((e) => {
      indexPromise = null;
      throw e;
    }));

const norm = (v: string) => v.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Folder name of a volume in public/ocr-text/ (same rule as scripts/ocr-batch.mjs). */
export const volumeSlug = (v: string) =>
  norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** OCR text pre-computed by the CI for this page, or null if it has not been processed yet. */
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
  return { volume: volume.trim(), page: page ? parseInt(page[1], 10) : 1 };
}

export interface ResolvedPage {
  volume: string;
  page: number;
  totalPages: number;
  fileName: string;
  imageUrl: string;
}

export async function resolveArchivePage(url: string): Promise<ResolvedPage> {
  const ref = parseReaderUrl(url);
  if (!ref) throw new Error("URL non reconnue : elle doit contenir « Lecteur_des_archives/<volume>#page/<n> ».");
  const index = await loadIndex();
  const entry = index[norm(ref.volume)];
  if (!entry || !entry.files.length) {
    throw new Error(
      `Le volume « ${ref.volume} » n'est pas dans l'index des scans (archive-index.json). ` +
        `Relancez le workflow GitHub « Deploy to GitHub Pages », ou importez le scan à la main.`,
    );
  }
  const i = Math.max(0, Math.min(ref.page - 1, entry.files.length - 1));
  const fileName = entry.files[i];
  return {
    volume: ref.volume,
    page: ref.page,
    totalPages: entry.files.length,
    fileName,
    imageUrl: `https://search.archives.nat.tn/uploads/${encodeURIComponent(entry.folder)}/${encodeURIComponent(fileName)}`,
  };
}

export class ScanNotReadableError extends Error {
  constructor(public imageUrl: string) {
    super(
      "Cette page n'a pas encore été traitée par l'OCR automatique, et le navigateur n'a pas le droit de lire l'image (les Archives nationales ne l'autorisent pas). " +
        "Patientez jusqu'au prochain passage de l'action « OCR batch », ou enregistrez le scan (clic droit → Enregistrer) puis importez-le avec « Scan image », glissez-le ici ou collez-le (Ctrl+V).",
    );
  }
}

/** Downloads the scan so it can be OCR'd. Works only if the archive server sends CORS headers. */
export async function fetchScan(imageUrl: string): Promise<Blob> {
  try {
    const r = await fetch(imageUrl, { mode: 'cors', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.blob();
  } catch {
    throw new ScanNotReadableError(imageUrl);
  }
}
