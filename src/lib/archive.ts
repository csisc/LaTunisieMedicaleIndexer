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
      "Le navigateur n'a pas le droit de lire cette image (les Archives nationales n'autorisent pas la lecture depuis un autre site). " +
        "Enregistrez le scan (clic droit sur l'image → Enregistrer), puis importez-le avec « Scan image », glissez-le ici ou collez-le (Ctrl+V).",
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
