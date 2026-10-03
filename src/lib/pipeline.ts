import { findRow, nextArticleUrl, volumeForYear } from '../api';
import { parseArticleOffline, deriveLastPageFromUrls } from '../utils/offlineParser';
import { ParsedMetadata } from '../types/article';
import { resolveArchivePage, fetchScan, fetchPrecomputedOcr, parseReaderUrl, ScanUnavailableError } from './archive';
import { ocrImage } from './ocr';
import { enrichFromWikidata } from './wikidata';

export interface PipelineResult {
  ocrText: string;
  metadata: ParsedMetadata;
  imageUrl: string;
  wikiProjectInfo: any | null;
}

export type Step = (label: string) => void;

async function buildMetadata(ocrText: string, url: string, volumeName: string, pageNum: number, step: Step) {
  const row = await findRow(url);
  const nextUrl = (await nextArticleUrl(url)) || undefined;
  const year = row?.year || parseInt(volumeName.match(/(\d{4})/)?.[1] ?? '', 10) || undefined;
  // volume and issue come from the work queue; when the queue does not carry them, the volume is derived from the
  // queue's other rows (same year, else the closest year) and the issue is left empty rather than invented
  const volumeHint = row?.volume || (year ? await volumeForYear(year) : '');

  let metadata = parseArticleOffline(ocrText, {
    url,
    nextUrl,
    yearHint: year,
    pageHint: row?.page || String(pageNum),
    volumeHint,
    issueHint: row?.issue,
  });

  // project formula: last page = first page + (next URL page - this URL page)
  const derived = deriveLastPageFromUrls(metadata.firstPage, url, nextUrl);
  if (derived) {
    metadata = {
      ...metadata,
      lastPage: derived.lastPage,
      pageRange: derived.pageRange,
      pageEndDerivedFromNextUrl: true,
      pageDiffFormula: derived.formula,
      nextWorkUrl: nextUrl,
    };
  }

  step('6. Recherche des auteurs et sujets sur Wikidata…');
  const { authors, subjects } = await enrichFromWikidata(metadata);
  metadata = { ...metadata, authors, subjects };
  return { metadata, wikiProjectInfo: row ? { ...row, status: 'not done', qid: '' } : null };
}

/**
 * Archive URL -> OCR text -> metadata, in the order that works on a static host such as GitHub Pages:
 *   1. OCR text computed by the CI (public/ocr-text/<volume>/<page>.txt): no access to the archive is needed at all
 *   2. otherwise the page list of the volume is read from the archive's reader page and the scan is downloaded
 *      (see archiveFetch.ts for the routes tried), then Tesseract runs in the browser
 * The scan picture is shown whenever it can be resolved; failing to resolve it never blocks the extraction.
 */
export async function processArchiveUrl(
  url: string,
  step: Step,
  onImage: (imageUrl: string) => void,
): Promise<PipelineResult> {
  const ref = parseReaderUrl(url);
  if (!ref) throw new Error("URL non reconnue : elle doit contenir « Lecteur_des_archives/<volume>#page/<n> ».");

  step('1. Recherche du texte OCR déjà calculé…');
  let ocrText = await fetchPrecomputedOcr(ref.volume, ref.page);
  let imageUrl = '';

  if (ocrText !== null) {
    // text is ready: the picture is only a display aid, resolved in the background of the extraction
    resolveArchivePage(url).then((p) => onImage(p.imageUrl)).catch(() => undefined);
  } else {
    step(`2. Lecture de la liste des pages du volume « ${ref.volume} »…`);
    const page = await resolveArchivePage(url, (route) => step(`2. Lecture du volume (${route})…`));
    imageUrl = page.imageUrl;
    onImage(imageUrl); // the <img> tag displays it even where scripts cannot read it
    step(`3. Téléchargement du scan (page ${ref.page} / ${page.totalPages})…`);
    const blob = await fetchScan(imageUrl, (route) => step(`3. Téléchargement du scan (${route})…`));
    step('4. OCR Tesseract dans le navigateur (le premier lancement charge le modèle, ~1 Mo)…');
    ocrText = await ocrImage(blob, (p) => step(`4. OCR Tesseract… ${Math.round(p * 100)} %`));
  }

  step('5. Extraction des métadonnées…');
  const { metadata, wikiProjectInfo } = await buildMetadata(ocrText, url, ref.volume, ref.page, step);
  return { ocrText, metadata, imageUrl, wikiProjectInfo };
}

/**
 * Last resort only, used when every automatic route to the archive failed: a scan the user provides themselves
 * (file, drag & drop or paste). `url` is the archive URL it belongs to, if known.
 */
export async function processImageFile(file: Blob, url: string, step: Step): Promise<PipelineResult & { objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  step('1. OCR Tesseract dans le navigateur…');
  const ocrText = await ocrImage(file, (p) => step(`1. OCR Tesseract… ${Math.round(p * 100)} %`));
  step('2. Extraction des métadonnées…');
  const ref = parseReaderUrl(url);
  const { metadata, wikiProjectInfo } = ref
    ? await buildMetadata(ocrText, url, ref.volume, ref.page, step)
    : { metadata: parseArticleOffline(ocrText, { url: url || undefined }), wikiProjectInfo: null };
  return { ocrText, metadata, imageUrl: objectUrl, objectUrl, wikiProjectInfo };
}

export { ScanUnavailableError };
