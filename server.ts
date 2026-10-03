import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { parseArticleOffline, deriveLastPageFromUrls } from './src/utils/offlineParser.ts';
import { store, COLLECTIONS, CollectionId } from './backend/csvStore.ts';
import { syncWithWikidata, startSyncScheduler, getLastSync } from './backend/wikidataSync.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));

// The frontend can live on GitHub Pages (another origin): ALLOWED_ORIGIN=https://<user>.github.io
app.use((req: Request, res: Response, next) => {
  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed && req.headers.origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});


// ---------- Work queue (backend/data/articles.csv) ----------
const isCollection = (v: any): v is CollectionId => v in COLLECTIONS;

app.get('/api/collections', (_req: Request, res: Response) => {
  res.json({ collections: Object.values(store.summary()), lastSync: getLastSync() });
});

app.get('/api/articles', (req: Request, res: Response) => {
  const collection = req.query.collection;
  if (!isCollection(collection)) return res.status(400).json({ error: 'Unknown collection' });
  res.json(
    store.list({
      collection,
      q: req.query.q as string,
      year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
      offset: parseInt((req.query.offset as string) || '0', 10),
      limit: parseInt((req.query.limit as string) || '50', 10),
    }),
  );
});

app.get('/api/articles/next', (req: Request, res: Response) => {
  const collection = req.query.collection;
  if (!isCollection(collection)) return res.status(400).json({ error: 'Unknown collection' });
  res.json({ item: store.next(collection, req.query.after as string) });
});

// Manual shortcut: the user has just created the Wikidata item, drop the page from the queue now
app.post('/api/articles/mark-created', (req: Request, res: Response) => {
  const { url, qid } = req.body || {};
  if (!url || (qid && !/^Q\d+$/.test(qid))) return res.status(400).json({ error: 'Provide url and an optional QID like Q123' });
  const removed = store.remove([{ keyOrUrl: url, qids: qid ? [qid] : [] }], 'marked created by user');
  res.json({ removed: removed.length });
});

app.post('/api/sync', async (_req: Request, res: Response) => {
  const result = await syncWithWikidata();
  res.status(result.ok ? 200 : 502).json(result);
});

app.get('/api/sync/status', (_req: Request, res: Response) => res.json({ lastSync: getLastSync() }));

// Wikidata entity search proxy (searches authors and medical subjects)
app.get('/api/wikidata-search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string || '').trim();
    const type = (req.query.type as string || 'item'); // 'item' or 'property'
    const language = (req.query.lang as string || 'fr');

    if (!query || query.length < 2) {
      return res.json({ search: [] });
    }

    const wikidataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      query
    )}&language=${language}&type=${type}&limit=8&format=json`;

    const response = await fetch(wikidataUrl, {
      headers: {
        'User-Agent': 'LaTunisieMedicaleTool/1.0 (https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community; contact: wikidata-arabic@wikimedia.org)',
      },
    });

    if (!response.ok) {
      throw new Error(`Wikidata API error: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Wikidata search proxy error:', error);
    res.status(500).json({ error: error.message || 'Failed to search Wikidata' });
  }
});

// Cache for archive volumes file list: volumeName -> { folder, files }
const volumeCache = new Map<string, { folder: string; files: string[] }>();

async function getVolumeFiles(volumeName: string): Promise<{ folder: string; files: string[] }> {
  if (volumeCache.has(volumeName)) {
    return volumeCache.get(volumeName)!;
  }
  const cleanVol = decodeURIComponent(volumeName).trim();
  const url = `https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/${encodeURIComponent(cleanVol)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load archive reader for ${volumeName}: ${response.statusText}`);
  }

  const html = await response.text();
  const folderMatch = html.match(/var\s+folder\s*=\s*['"]([^'"]+)['"]/);
  const folder = folderMatch ? folderMatch[1] : cleanVol;

  const fStart = html.indexOf('var files=');
  const fEnd = html.indexOf('files=JSON.parse(files)');
  if (fStart !== -1 && fEnd !== -1) {
    const raw = html.slice(fStart + 'var files='.length, fEnd).trim().replace(/;$/, '');
    const innerJson = JSON.parse(raw);
    const files: string[] = typeof innerJson === 'string' ? JSON.parse(innerJson) : innerJson;
    const result = { folder, files };
    volumeCache.set(volumeName, result);
    return result;
  }

  throw new Error(`Could not parse page images from archive reader for ${volumeName}`);
}

// Proxy endpoint to resolve reader URL to exact scanned page image
app.get('/api/archive-page', async (req: Request, res: Response) => {
  try {
    const targetUrl = (req.query.url as string || '').trim();
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    // Extract volume and page number from URL:
    // e.g. https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/9/mode/2up
    const volMatch = targetUrl.match(/Lecteur_des_archives\/([^#/]+)/);
    const pageMatch = targetUrl.match(/#page\/(\d+)/);

    const volumeName = volMatch ? decodeURIComponent(volMatch[1]) : 'La Tunisie Medicale-1954';
    const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;

    const { folder, files } = await getVolumeFiles(volumeName);
    const index = Math.max(0, Math.min(pageNum - 1, files.length - 1));
    const fileName = files[index];

    const remoteImageUrl = `https://search.archives.nat.tn/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}`;
    const proxyImageUrl = `/api/proxy-image?url=${encodeURIComponent(remoteImageUrl)}`;

    res.json({
      volume: volumeName,
      page: pageNum,
      totalPages: files.length,
      fileName,
      remoteImageUrl,
      proxyImageUrl,
    });
  } catch (error: any) {
    console.error('Error resolving archive page:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve archive page' });
  }
});

// Proxy image stream from archives.nat.tn (solves mixed-content and CORS)
app.get('/api/proxy-image', async (req: Request, res: Response) => {
  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send('Missing url');
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: 'https://search.archives.nat.tn/',
      },
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image from archive');
    }

    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error('Error proxying image:', error);
    res.status(500).send('Proxy error');
  }
});

// Real-time Resolve & OCR endpoint: given an ANT reader URL, fetch the real scan and OCR it
app.post('/api/resolve-and-ocr', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing url in request body' });
    }

    // 1. Resolve exact image URL
    let remoteImageUrl = '';
    let volumeName = 'La Tunisie Medicale-1954';
    let pageNum = 1;
    let fileName = '';

    if (url.match(/\.(jpg|jpeg|png|webp)($|\?)/i) || url.includes('/uploads/')) {
      remoteImageUrl = url;
      fileName = url.split('/').pop()?.split('?')[0] || 'scan.jpg';
      const yearInFile = fileName.match(/(\d{4})/);
      if (yearInFile) volumeName = `La Tunisie Medicale-${yearInFile[1]}`;
    } else {
      const volMatch = url.match(/Lecteur_des_archives\/([^#/]+)/);
      const pageMatch = url.match(/#page\/(\d+)/);
      volumeName = volMatch ? decodeURIComponent(volMatch[1]) : 'La Tunisie Medicale-1954';
      pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;

      const { folder, files } = await getVolumeFiles(volumeName);
      const index = Math.max(0, Math.min(pageNum - 1, files.length - 1));
      fileName = files[index];
      remoteImageUrl = `https://search.archives.nat.tn/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}`;
    }

    const proxyImageUrl = `/api/proxy-image?url=${encodeURIComponent(remoteImageUrl)}`;

    // 2. Fetch the image bytes
    const imgResp = await fetch(remoteImageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: 'https://search.archives.nat.tn/',
      },
    });

    if (!imgResp.ok) {
      throw new Error(`Failed to download image from ${remoteImageUrl}`);
    }

    const imgBuffer = Buffer.from(await imgResp.arrayBuffer());

    // 3. Run real OCR using Tesseract with local traineddata
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('fra', 1, { langPath: '.' });
    const ocrResult = await worker.recognize(imgBuffer);
    await worker.terminate();

    const ocrText = ocrResult.data.text || '';

    // 4. Cross-reference Meta-Wiki project page index
    const cleanUrl = url.trim();
    const row = store.findByUrl(cleanUrl);
    const wikiInfo = row
      ? { ...row, status: 'not done', qid: '', source: row.source }
      : null;

    const yearMatch = volumeName.match(/(\d{4})/);
    const fallbackYear = yearMatch ? parseInt(yearMatch[1], 10) : 1954;
    const year = wikiInfo?.year || fallbackYear;

    // Parse baseline metadata strictly from the OCR text output and Meta-Wiki table
    // Next article of the same volume (from the CSV queue and the log of pages already on Wikidata)
    const nextUrl = store.nextArticleUrl(cleanUrl) || undefined;

    let metadata = parseArticleOffline(ocrText, {
      url: cleanUrl,
      nextUrl,
      yearHint: year,
      pageHint: wikiInfo?.page || pageNum.toString(),
      volumeHint: wikiInfo?.volume,
      issueHint: wikiInfo?.issue,
    });

    // 5. Enhance using Gemini Flash if API key is present and OCR yielded text
    if (process.env.GEMINI_API_KEY && ocrText.trim().length > 15) {
      try {
        const geminiResp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              text: `You are a specialized bibliographer for the Wikidata Arabic Community project to index the historical digitized medical journal "La Tunisie Médicale" (https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation).
Extract the bibliographic metadata for this scholarly article strictly from the real OCR text output below and the Meta-Wiki project context. Do not invent or hallucinate data.

Meta-Wiki Page Information:
- Year: ${year}
- Initial Page Number: ${wikiInfo?.page || pageNum}
- Journal: "La Tunisie Médicale" (Wikidata QID: Q3213360)
- Notes: ${wikiInfo?.notes || ''}

Real OCR Text of First Page:
"""
${ocrText}
"""

Instructions:
1. "title": Exact scholarly article title from the OCR text, without journal running headers or page numbers.
2. "authors": Array of authors found in the text. Strip honorary titles (Dr, Pr, Professeur). If an author has a known Wikidata QID (e.g. Charles Nicolle Q235187, Ahmed Ben Miled Q2829286, Ernest Conseil Q3056909), include it.
3. "volume": Volume number (clean digits, e.g. "32").
4. "issue": Issue number (e.g. "1").
5. "publicationDate": Format YYYY-MM-00 or YYYY-00-00.
6. "datePrecision": 10 if month is known, 9 if only year.
7. "firstPage": Exact printed journal page number recognized directly in the OCR text (e.g. from the running header or page corner, such as "21", "45", "53", etc.). DO NOT assume the page number from the URL; recognize it strictly from the OCR text.
8. "lastPage": End page string if mentioned in the OCR text or notes, otherwise empty.
9. "pageRange": Page or page range recognized from the OCR text (e.g. "21", "21-32", "45-50").
10. "language": "fr" or "ar".
11. "languageQid": "Q150" or "Q13955".
12. "subjects": Medical topics actually discussed in this specific text with their Wikidata QIDs. Only include topics directly relevant to the text.
13. "abstractSnippet": 1-2 sentence excerpt of the opening text.`,
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                authors: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      wikidataId: { type: Type.STRING },
                      affiliation: { type: Type.STRING },
                    },
                    required: ['id', 'name'],
                  },
                },
                publicationDate: { type: Type.STRING },
                datePrecision: { type: Type.INTEGER },
                volume: { type: Type.STRING },
                issue: { type: Type.STRING },
                firstPage: { type: Type.STRING },
                lastPage: { type: Type.STRING },
                pageRange: { type: Type.STRING },
                language: { type: Type.STRING },
                languageQid: { type: Type.STRING },
                subjects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      wikidataId: { type: Type.STRING },
                    },
                    required: ['id', 'name'],
                  },
                },
                abstractSnippet: { type: Type.STRING },
              },
              required: ['title', 'authors', 'publicationDate', 'volume', 'issue', 'pageRange', 'language'],
            },
          },
        });

        if (geminiResp.text) {
          const parsed = JSON.parse(geminiResp.text);
          const finalFirstPage = (metadata.pageRecognizedFromOcr ? metadata.firstPage : parsed.firstPage) || parsed.firstPage || metadata.firstPage;
          const finalPageRange = (metadata.pageRecognizedFromOcr ? metadata.pageRange : parsed.pageRange) || parsed.pageRange || metadata.pageRange;

          metadata = {
            ...metadata,
            ...parsed,
            firstPage: finalFirstPage,
            pageRange: finalPageRange,
            pageRecognizedFromOcr: metadata.pageRecognizedFromOcr || !!parsed.firstPage,
            ocrPageSnippet: metadata.ocrPageSnippet,
            journalName: 'La Tunisie Médicale',
            journalQid: 'Q3213360',
            fullWorkUrl: cleanUrl,
            confidenceScore: 0.98,
            parsingEngine: 'gemini_flash',
          };
        }
      } catch (gemErr) {
        console.warn('Gemini semantic enhancement failed, using offline parser:', gemErr);
      }
    }

    // Gemini may overwrite the page fields: the project formula always wins when it applies
    const derived = deriveLastPageFromUrls(metadata.firstPage, cleanUrl, nextUrl);
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

    res.json({
      ocrText,
      metadata,
      remoteImageUrl,
      proxyImageUrl,
      fileName,
      volumeName,
      page: pageNum,
      wikiProjectInfo: wikiInfo,
    });
  } catch (error: any) {
    console.error('Resolve and OCR error:', error);
    res.status(500).json({ error: error.message || 'Failed to process page' });
  }
});

// OCR endpoint using Gemini 3.8 Flash Vision
app.post('/api/ocr', async (req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please use client-side OCR or offline parsing.',
      });
    }

    const { imageBase64, mimeType = 'image/png' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 in request body.' });
    }

    // Clean base64 data header if present
    const rawData = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: rawData,
          },
        },
        {
          text: `You are an expert archivist and medical historian specializing in historical scientific periodicals.
Transcribe all text from this scanned first page of the medical journal "La Tunisie Médicale".
Preserve all masthead info, volume, issue, year, month, article title, authors, affiliations, footnote markings, and article body text.
Transcribe with highest fidelity, preserving original French accents (é, è, ê, à, ç) and Arabic script if present.
Do not hallucinate text. If faint or clipped, mark with [?].`,
        },
      ],
    });

    res.json({ text: response.text || '' });
  } catch (error: any) {
    console.error('Server OCR error:', error);
    res.status(500).json({ error: error.message || 'OCR processing failed' });
  }
});

// Parse article endpoint using Gemini 3.8 Flash
app.post('/api/parse-article', async (req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please use the offline parser.',
      });
    }

    const { text, imageBase64, mimeType = 'image/png', hints = {} } = req.body;

    if (!text && !imageBase64) {
      return res.status(400).json({ error: 'Provide either text or imageBase64 to parse.' });
    }

    const contents: any[] = [];

    if (imageBase64) {
      const rawData = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
      contents.push({
        inlineData: {
          mimeType,
          data: rawData,
        },
      });
    }

    const promptText = `You are a bibliographic metadata cataloger for the Wikidata Arabic Community initiative to index "La Tunisie Médicale" (https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation).
Extract the bibliographic metadata for the scholarly article from the provided first page or OCR text.

Context / Hints:
- Journal: "La Tunisie Médicale" (Wikidata QID: Q3213360)
- URL Hint: ${hints.url || 'None'}
- Year Hint: ${hints.year || 'None'}
- Page Hint: ${hints.page || 'None'}
- Text content:
"""
${text || ''}
"""

Instructions:
1. "title": Clean title of the article, removing journal mastheads ("LA TUNISIE MÉDICALE", "REVUE MENSUELLE", etc.). Capitalize cleanly.
2. "authors": Array of authors. Strip honorary titles like "Dr.", "Professeur", "Médecin des Hôpitaux". Identify historical figures if known (e.g. Ahmed Ben Miled is Q2829286, Charles Nicolle is Q235187, Ernest Conseil is Q3056909).
3. "volume": Volume number as clean digits (convert Roman numerals like XXXII to 32).
4. "issue": Issue number (e.g. "1", "4", "1-2").
5. "publicationDate": Date formatted as YYYY-MM-00 or YYYY-00-00.
6. "datePrecision": 9 for year-only, 10 for year and month.
7. "pageRange": Full page range (e.g. "9-14").
8. "firstPage": First page number.
9. "lastPage": Last page number.
10. "language": "fr", "ar", or "en".
11. "languageQid": "Q150" for French, "Q13955" for Arabic, "Q1860" for English.
12. "subjects": Array of medical subjects discussed (e.g. Malaria Q12156, Tuberculosis Q12204, Trachoma Q193215, Pediatrics Q11190, Public Health Q189603).
13. "abstractSnippet": Short 1-2 sentence excerpt or summary of the introduction.
14. "confidenceScore": Estimated confidence between 0.5 and 1.0.`;

    contents.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            titleArabic: { type: Type.STRING },
            authors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  wikidataId: { type: Type.STRING },
                  affiliation: { type: Type.STRING },
                },
                required: ['name'],
              },
            },
            journalName: { type: Type.STRING },
            journalQid: { type: Type.STRING },
            publicationDate: { type: Type.STRING },
            datePrecision: { type: Type.INTEGER },
            volume: { type: Type.STRING },
            issue: { type: Type.STRING },
            firstPage: { type: Type.STRING },
            lastPage: { type: Type.STRING },
            pageRange: { type: Type.STRING },
            language: { type: Type.STRING },
            languageQid: { type: Type.STRING },
            subjects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  wikidataId: { type: Type.STRING },
                },
                required: ['name', 'wikidataId'],
              },
            },
            abstractSnippet: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER },
          },
          required: [
            'title',
            'authors',
            'publicationDate',
            'volume',
            'issue',
            'pageRange',
            'language',
          ],
        },
      },
    });

    const parsedJson = JSON.parse(response.text?.trim() || '{}');
    // Ensure standard defaults
    parsedJson.journalName = 'La Tunisie Médicale';
    parsedJson.journalQid = 'Q3213360';
    parsedJson.fullWorkUrl = hints.url || parsedJson.fullWorkUrl || '';
    parsedJson.parsingEngine = 'gemini_flash';

    res.json(parsedJson);
  } catch (error: any) {
    console.warn('Server parse error, using offline specialized parser fallback:', error?.message || error);
    try {
      const { text = '', hints = {} } = req.body;
      const fallback = parseArticleOffline(text, {
        url: hints.url,
        yearHint: hints.year ? parseInt(hints.year, 10) : undefined,
        pageHint: hints.page,
      });
      return res.json(fallback);
    } catch (fallbackError: any) {
      res.status(500).json({ error: error.message || 'Parsing failed' });
    }
  }
});

// In development, mount Vite middleware; in production, serve built dist files
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    startSyncScheduler();
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
