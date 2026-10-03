/**
 * Tesseract OCR running entirely in the browser, with every asset served from this site
 * (worker, wasm core and the French language data live in /ocr/, nothing comes from a CDN).
 */
import type { Worker } from 'tesseract.js';
import { assetUrl } from '../api';

const abs = (p: string) => new URL(assetUrl(p), window.location.href).href.replace(/\/$/, '');

let workerPromise: Promise<Worker> | null = null;
let onProgress: ((pct: number, status: string) => void) | null = null;

function getWorker(): Promise<Worker> {
  // tesseract.js is loaded on first use only: pages whose OCR text is already published never download it
  return (workerPromise ??= import('tesseract.js').then(({ createWorker }) => createWorker('fra', 1, {
    workerPath: abs('ocr/worker.min.js'),
    corePath: abs('ocr'),
    langPath: abs('ocr'),
    gzip: false, // fra.traineddata is stored uncompressed
    workerBlobURL: false, // load the worker from our own origin
    logger: (m: any) => onProgress?.(typeof m.progress === 'number' ? m.progress : 0, m.status || ''),
  })).catch((e) => {
    workerPromise = null;
    throw e;
  }));
}

export async function ocrImage(
  image: Blob | File | string,
  progress?: (pct: number, status: string) => void,
): Promise<string> {
  onProgress = progress ?? null;
  const worker = await getWorker();
  const { data } = await worker.recognize(image as any);
  onProgress = null;
  return data.text || '';
}
