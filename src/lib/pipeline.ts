import { findRow, nextArticleUrl } from '../api';
import { parseArticleOffline, deriveLastPageFromUrls } from '../utils/offlineParser';
import { ParsedMetadata } from '../types/article';
import { resolveArchivePage, fetchScan, ScanNotReadableError } from './archive';
import { ocrImage } from './ocr';

export interface PipelineResult {
  ocrText: string;
  metadata: ParsedMetadata;
  imageUrl: string;
  wikiProjectInfo: any | null;
}

export type Step = (label: string) => void;

async function buildMetadata(ocrText: string, url: string, volumeName: string, pageNum: number) {
  const row = await findRow(url);
  const nextUrl = (await nextArticleUrl(url)) || undefined;
  const year = row?.year || parseInt(volumeName.match(/(\d{4})/)?.[1] ?? '', 10) || undefined;

  let metadata = parseArticleOffline(ocrText, {
    url,
    nextUrl,
    yearHint: year,
    pageHint: row?.page || String(pageNum),
    volumeHint: row?.volume,
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
  return { metadata, wikiProjectInfo: row ? { ...row, status: 'not done', qid: '' } : null };
}

/** Archive URL -> scan -> OCR -> metadata, all in the browser. */
export async function processArchiveUrl(
  url: string,
  step: Step,
  onImage: (imageUrl: string) => void,
): Promise<PipelineResult> {
  step("1. Recherche du scan dans l'index des volumes…");
  const page = await resolveArchivePage(url);
  onImage(page.imageUrl); // shown even if the browser cannot read it for OCR

  step('2. Téléchargement du scan…');
  const blob = await fetchScan(page.imageUrl);

  step('3. OCR Tesseract dans le navigateur (le premier lancement charge le modèle, ~1 Mo)…');
  const ocrText = await ocrImage(blob, (p) => step(`3. OCR Tesseract… ${Math.round(p * 100)} %`));

  step('4. Extraction des métadonnées…');
  const { metadata, wikiProjectInfo } = await buildMetadata(ocrText, url, page.volume, page.page);
  return { ocrText, metadata, imageUrl: page.imageUrl, wikiProjectInfo };
}

/** A scan the user provides (file, drag & drop or paste). `url` is the archive URL it belongs to, if known. */
export async function processImageFile(file: Blob, url: string, step: Step): Promise<PipelineResult & { objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  step('1. OCR Tesseract dans le navigateur…');
  const ocrText = await ocrImage(file, (p) => step(`1. OCR Tesseract… ${Math.round(p * 100)} %`));
  step('2. Extraction des métadonnées…');
  const ref = url.match(/Lecteur_des_archives\/([^#/?]+).*?page\/(\d+)/i);
  const volume = ref ? decodeURIComponent(ref[1]) : '';
  const { metadata, wikiProjectInfo } = ref
    ? await buildMetadata(ocrText, url, volume, parseInt(ref[2], 10))
    : { metadata: parseArticleOffline(ocrText, { url: url || undefined }), wikiProjectInfo: null };
  return { ocrText, metadata, imageUrl: objectUrl, objectUrl, wikiProjectInfo };
}

export { ScanNotReadableError };
