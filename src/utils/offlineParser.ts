import { ParsedMetadata, AuthorRef, SubjectRef } from '../types/article';

// French month mapping
const MONTH_MAP_FR: { regex: RegExp; code: string }[] = [
  { regex: /janvier/i, code: '01' },
  { regex: /f[ée]vrier/i, code: '02' },
  { regex: /mars/i, code: '03' },
  { regex: /avril/i, code: '04' },
  { regex: /mai/i, code: '05' },
  { regex: /juin/i, code: '06' },
  { regex: /juillet/i, code: '07' },
  { regex: /ao[uû]t/i, code: '08' },
  { regex: /septembre/i, code: '09' },
  { regex: /octobre/i, code: '10' },
  { regex: /novembre/i, code: '11' },
  { regex: /d[ée]cembre/i, code: '12' }
];

const MONTH_MAP_AR: Record<string, string> = {
  'جانفي': '01', 'يناير': '01',
  'فيفري': '02', 'فبراير': '02',
  'مارس': '03',
  'أفريل': '04', 'ابريل': '04', 'إبريل': '04',
  'ماي': '05', 'مايو': '05',
  'جوان': '06', 'يونيو': '06',
  'جويلية': '07', 'يوليو': '07',
  'أوت': '08', 'اغسطس': '08', 'أغسطس': '08',
  'سبتمبر': '09',
  'أكتوبر': '10', 'اكتوبر': '10',
  'نوفمبر': '11',
  'ديسمبر': '12'
};

function romanToArabic(roman: string): number {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0;
  const upper = roman.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const current = map[upper[i]] || 0;
    const next = map[upper[i + 1]] || 0;
    if (next > current) {
      result += next - current;
      i++;
    } else {
      result += current;
    }
  }
  return result;
}

/**
 * Does this OCR line introduce the authors ("Par le Docteur X", "par MM. A. DUPONT et B. MARTIN", "الدكتور ...")?
 * Structural rule: after "par" and any honorific, the text must start with a name (a capitalised word or initial),
 * so that sentences such as "par le chloramphénicol" are not mistaken for an author line.
 */
export function looksLikeAuthorLine(line: string): boolean {
  const l = line.trim();
  if (/^(?:الدكتور|الدكتورة|الدكتوران|الأستاذ)\s/.test(l)) return true;
  const m = l.match(/^par\s+(.+)$/i);
  if (!m) return false;
  const honorific = /^(?:(?:les?|MM?\.?|MM|Mme|Mlle)\s+)?(?:(?:Docteurs?|Professeurs?|Drs?\.?|Prs?\.?|Prof\.?|M[ée]decins?)\s+)*/i;
  const rest = m[1].replace(honorific, '').replace(/^(?:MM?\.?|Mme|Mlle)\s+/i, '').trim();
  return /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*/.test(rest) && rest.length >= 3;
}

/**
 * Extracts the scan page number from an archive URL or file pattern.
 * e.g. #page/23/mode/2up -> 23
 */
export function extractPageNumberFromUrl(url: string): number | null {
  if (!url) return null;
  const hashMatch = url.match(/#page\/(\d+)/i);
  if (hashMatch) return parseInt(hashMatch[1], 10);

  const queryMatch = url.match(/[?&]page=(\d+)/i);
  if (queryMatch) return parseInt(queryMatch[1], 10);

  const slashMatch = url.match(/\/page\/(\d+)/i);
  if (slashMatch) return parseInt(slashMatch[1], 10);

  const fileMatch = url.match(/_0*(\d+)\.(?:jpe?g|png|webp)/i);
  if (fileMatch) return parseInt(fileMatch[1], 10);

  return null;
}

/**
 * Recognizes the article page number(s) directly from the raw OCR text.
 * Checks running headers, folio lines, explicit range matches, and footer lines.
 */
export function extractPagesFromOcrText(
  cleanText: string,
  lines: string[],
  fallbackHint?: string
): { firstPage: string; lastPage: string; pageRange: string; foundInOcr: boolean; snippet?: string } {
  let firstPage = '';
  let lastPage = '';
  let foundInOcr = false;
  let snippet = '';

  // 1. Explicit range anywhere in the OCR text: e.g. "pages 45 à 52", "pp. 21-34", "ص 10-18"
  const rangeMatch = cleanText.match(/\b(?:pages?|pp?\.?|p\.|ص)\s*(\d{1,4})\s*(?:[-—–à]|jusqu['’]?[àa]|إلى)\s*(\d{1,4})\b/i);
  if (rangeMatch) {
    firstPage = rangeMatch[1];
    lastPage = rangeMatch[2];
    foundInOcr = true;
    snippet = rangeMatch[0];
  }

  // 2. Check top lines (first 6 lines of the scan) for header page numbers
  if (!firstPage) {
    const topLines = lines.slice(0, 6);
    for (const rawLine of topLines) {
      const line = rawLine.replace(/^[|;:—_~«"'\s]+/, '').trim();
      if (!line) continue;

      // Running header ending with page number: e.g. "LES HERNIES DE L'HIATUS ŒSOPHAGIEN 21" or "CHLORAMPHÉNICOL 45"
      const mEnd = line.match(/([A-Za-zÀ-öø-ÿ\s'’\-.:]+)\s+(\d{1,4})$/);
      if (mEnd) {
        const pVal = parseInt(mEnd[2], 10);
        const prefix = mEnd[1].trim();
        // Discard year mentions like "Année 1954" or "Volume 1954"
        const isYear = pVal >= 1880 && pVal <= 2030 && /ann[ée]e|volume|tome|revue/i.test(line);
        if (pVal >= 1 && pVal <= 2500 && prefix.length >= 3 && !isYear) {
          firstPage = pVal.toString();
          foundInOcr = true;
          snippet = line;
          break;
        }
      }

      // Running header starting with page number: e.g. "21 LES HERNIES DE L'HIATUS" or "45 TRAITEMENT MÉDICAL"
      const mStart = line.match(/^(\d{1,4})\s+([A-Za-zÀ-öø-ÿ\s'’\-.:]+)/);
      if (mStart) {
        const pVal = parseInt(mStart[1], 10);
        const isYear = pVal >= 1880 && pVal <= 2030 && /ann[ée]e|volume|tome|revue/i.test(line);
        if (pVal >= 1 && pVal <= 2500 && !isYear) {
          firstPage = pVal.toString();
          foundInOcr = true;
          snippet = line;
          break;
        }
      }

      // Standalone line containing only page number: e.g. "21", "— 53 —", "(63)", "Page 21", "P. 45"
      const mLone = line.match(/^[-—–\[\(\s]*(?:page|p\.|pp\.|ص)?\s*(\d{1,4})[-—–\]\)\s]*$/i);
      if (mLone) {
        const pVal = parseInt(mLone[1], 10);
        const isYear = pVal >= 1880 && pVal <= 2030;
        if (pVal >= 1 && pVal <= 2500 && !isYear) {
          firstPage = pVal.toString();
          foundInOcr = true;
          snippet = line;
          break;
        }
      }
    }
  }

  // 3. Check bottom lines (last 3 lines of the scan) for footer page numbers
  if (!firstPage && lines.length > 5) {
    const bottomLines = lines.slice(-3);
    for (const rawLine of bottomLines) {
      const line = rawLine.replace(/^[|;:—_~«"'\s]+/, '').trim();
      const mLone = line.match(/^[-—–\[\(\s]*(?:page|p\.|pp\.|ص)?\s*(\d{1,4})[-—–\]\)\s]*$/i);
      if (mLone) {
        const pVal = parseInt(mLone[1], 10);
        if (pVal >= 1 && pVal <= 2500 && !(pVal >= 1880 && pVal <= 2030)) {
          firstPage = pVal.toString();
          foundInOcr = true;
          snippet = line;
          break;
        }
      }
    }
  }

  // 4. Fallback if no page could be detected in the OCR text
  if (!firstPage) {
    firstPage = fallbackHint || '1';
  }

  // Build pageRange
  let pageRange = '';
  if (firstPage && lastPage) {
    pageRange = `${firstPage}-${lastPage}`;
  } else if (firstPage) {
    pageRange = firstPage;
  }

  return { firstPage, lastPage, pageRange, foundInOcr, snippet };
}

/**
 * Project formula for the end page:
 *   last page = first page + (next article's URL page - this article's URL page)
 * `firstPage` is the printed page recognised from the OCR; the URL pages are scan indices from the archive reader URLs.
 * Returns null when the formula cannot be applied (no next article, no numeric first page, or non-increasing URLs).
 */
export function deriveLastPageFromUrls(
  firstPage: string,
  url?: string,
  nextUrl?: string,
): { lastPage: string; pageRange: string; formula: string } | null {
  const first = parseInt(firstPage, 10);
  const cur = url ? extractPageNumberFromUrl(url) : null;
  const nxt = nextUrl ? extractPageNumberFromUrl(nextUrl) : null;
  if (isNaN(first) || !cur || !nxt || nxt <= cur) return null;
  const last = first + (nxt - cur);
  return { lastPage: String(last), pageRange: `${first}-${last}`, formula: `${first} + (${nxt} - ${cur}) = ${last}` };
}

/**
 * Offline rule-based NLP parser simulating an offline specialized LLM for La Tunisie Médicale mastheads and articles.
 */
export function parseArticleOffline(
  text: string,
  hints?: {
    url?: string;
    nextUrl?: string;
    urlPageNum?: number;
    nextUrlPageNum?: number;
    urlPageDifference?: number;
    yearHint?: number;
    pageHint?: string;
    volumeHint?: string;
    issueHint?: string;
  }
): ParsedMetadata {
  const cleanText = text.trim();
  const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Detect language: check for Arabic characters
  const arabicRegex = /[\u0600-\u06FF]/;
  const isArabic = arabicRegex.test(cleanText);
  const language = isArabic ? 'ar' : 'fr';
  const languageQid = isArabic ? 'Q13955' : 'Q150';

  // 1. Extract Publication Year
  let year = hints?.yearHint || 0;
  if (!year) {
    const yearMatch = cleanText.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    }
  }

  // 2. Extract Month & Build Date
  let month = '00';
  let datePrecision: 9 | 10 = 9;

  if (isArabic) {
    for (const [mName, mCode] of Object.entries(MONTH_MAP_AR)) {
      if (cleanText.includes(mName)) {
        month = mCode;
        datePrecision = 10;
        break;
      }
    }
  } else {
    for (const m of MONTH_MAP_FR) {
      if (m.regex.test(cleanText)) {
        month = m.code;
        datePrecision = 10;
        break;
      }
    }
  }

  const publicationDate = year ? `${year}-${month}-00` : '';

  // 3. Extract Volume
  let volume = hints?.volumeHint || '';
  if (!volume) {
    const volRoman = cleanText.match(/TOME\s+([IVXLCDM]+)/i) || cleanText.match(/VOLUME\s+([IVXLCDM]+)/i);
    if (volRoman && volRoman[1]) {
      volume = romanToArabic(volRoman[1]).toString();
    } else {
      const volNum = cleanText.match(/(\d+)e\s+ANN[ÉE]E/i) || cleanText.match(/(?:Tome|Vol\.?|المجلد)\s*(\d+)/i);
      if (volNum && volNum[1]) {
        volume = volNum[1];
      }
    }
  }

  // 4. Extract Issue
  let issue = hints?.issueHint || '';
  if (!issue) {
    const issueMatch = cleanText.match(/(?:N°|NUM[ÉE]RO|العدد|fascicule)\s*(\d+(?:-\d+)?)/i);
    if (issueMatch && issueMatch[1]) {
      issue = issueMatch[1];
    }
  }

  // 5. Extract Pages strictly recognized from the OCR text
  const ocrPages = extractPagesFromOcrText(cleanText, lines, hints?.pageHint);
  let firstPage = ocrPages.firstPage;
  let lastPage = ocrPages.lastPage;
  const pageRecognizedFromOcr = ocrPages.foundInOcr;
  const ocrPageSnippet = ocrPages.snippet;
  let pageEndDerivedFromNextUrl = false;
  let pageDiffFormula = '';

  // Derive lastPage through the difference between current URL page and next URL page:
  // "Vous pouvez dériver la page de fin à travers la différence entre la page de l'URL et la page de l'URL suivant. La page de fin serait la somme de la page de début et cette différence."
  const urlPageNum = hints?.urlPageNum ?? (hints?.url ? extractPageNumberFromUrl(hints.url) : null);
  const nextUrlPageNum = hints?.nextUrlPageNum ?? (hints?.nextUrl ? extractPageNumberFromUrl(hints.nextUrl) : null);
  const diff = hints?.urlPageDifference ?? (urlPageNum && nextUrlPageNum && nextUrlPageNum > urlPageNum ? nextUrlPageNum - urlPageNum : null);

  if (firstPage && diff && diff > 0) {
    const firstPVal = parseInt(firstPage, 10);
    if (!isNaN(firstPVal)) {
      const calculatedEnd = firstPVal + diff;
      lastPage = calculatedEnd.toString();
      pageEndDerivedFromNextUrl = true;
      pageDiffFormula = `${firstPage} + (${nextUrlPageNum} - ${urlPageNum}) = ${lastPage}`;
    }
  }

  let pageRange = '';
  if (firstPage && lastPage && lastPage !== firstPage) {
    pageRange = `${firstPage}-${lastPage}`;
  } else if (firstPage) {
    pageRange = firstPage;
  }

  // 6. Extract Title & Authors from OCR text
  let title = '';
  const noisePatterns = [
    /LA TUNISIE M[ÉE]DICALE/i,
    /REVUE MENSUELLE/i,
    /BULLETIN MENSUEL/i,
    /ORGANE OFFICIEL/i,
    /SOCI[ÉE]T[ÉE] DES SCIENCES/i,
    /\d+e\s+ANN[ÉE]E/i,
    /TOME\s+[IVXLCDM\d]+/i,
    /المجلة الطبية التونسية/i,
    /المجلد\s+\d+/i,
    /العدد\s+\d+/i,
    /TRAVAIL DE/i,
    /COMMUNICATION DU/i,
    /INSTITUT PASTEUR/i,
    /S[ÉE]ANCE DU/i,
    /S[ÉE]ANCE INAUGURALE/i
  ];

  // 1. Identify Author Line in OCR text
  let authorLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/^[|;:—_~«"'\s]+/, '').trim();
    if (looksLikeAuthorLine(l)) {
      authorLineIdx = i;
      break;
    }
  }

  // 2. Extract Title lines preceding the Author Line
  if (authorLineIdx > 0) {
    const titleCandidates: string[] = [];
    for (let j = authorLineIdx - 1; j >= 0; j--) {
      let line = lines[j]
        .replace(/^[_|—«"'\s.:+=>;]+/, '')
        .replace(/[_|—»"'\s.:+=>;]+$/, '')
        .trim();

      // Skip running heads with page numbers at the very top (e.g. "... 45")
      if (/\b\d{1,4}$/.test(line) && j === 0) continue;
      // Skip OCR stray noise
      if (line.length < 3 || /^[^a-zA-Z0-9À-öø-ÿ]+$/.test(line) || /^[A-Z]\s*:\s*\d+/.test(line) || /^Là\b/.test(line)) {
        continue;
      }
      if (noisePatterns.some(p => p.test(line))) break;

      titleCandidates.unshift(line);
      // Collect up to 4 title lines
      if (titleCandidates.length >= 4) break;
    }

    if (titleCandidates.length > 0) {
      title = titleCandidates.join(' ');
    }
  }

  // Fallback title if author line was not detected
  if (!title) {
    const filteredLines = lines.filter(line => {
      return !noisePatterns.some(p => p.test(line)) &&
        !line.toLowerCase().startsWith('par ') &&
        !line.toLowerCase().startsWith('par m') &&
        !line.startsWith('الدكتور ') &&
        line.length > 10;
    });

    if (filteredLines.length > 0) {
      title = filteredLines[0];
      if (filteredLines.length > 1 && filteredLines[0].length < 60 && !filteredLines[1].includes('DOCTEUR')) {
        title += ' ' + filteredLines[1];
      }
    }
  }

  // Clean title noise artifacts and trailing footnote references like (1) or (d)
  title = title
    .replace(/^['`«"\s|—_=;:~+]+/, '')
    .replace(/^(?:L[àa]|I[lI1]|HIER|[.,;:~+])\s*[>.,:;—_~+<=\s]+/i, '')
    .replace(/['`»"\s|—_=;:~+]+$/, '')
    .replace(/\s*\([0-9a-z*†]\)\s*$/i, '')
    .replace(/\s+\d{1,4}$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize Title Case if all uppercase
  if (title === title.toUpperCase() && title.length > 10) {
    title = title.charAt(0) + title.slice(1).toLowerCase().replace(/(^|\s)([a-zà-öø-ÿ])/g, (m, p1, p2) => {
      return p1 + p2;
    });
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // No placeholder title: an empty title is flagged to the user instead of being exported as if it were real

  // 7. Extract Authors from OCR text
  const authors: AuthorRef[] = [];
  
  // Extract the authors from the author line
  if (authorLineIdx !== -1) {
    const rawAuthorLine = lines[authorLineIdx];
    const cleanedAuthorLine = rawAuthorLine
      .replace(/^[_\s|—=;:~«"']+/g, '')
      .replace(/^par\s+(?:les?\s+Docteurs?|MM?\.\s+les?\s+Professeurs?|le\s+Dr|les?\s+Drs?|le\s+Professeur|le\s+Pr|MM?\.)\s+/i, '')
      .replace(/^par\s+/i, '')
      .replace(/^الدكتور(?:ان)?\s+/, '')
      .replace(/de\s+l['']hôpital.*/i, '')
      .replace(/de\s+la\s+Faculté.*/i, '')
      .replace(/Professeur.*/i, '')
      .replace(/\(.*?\)/g, '')
      .trim();

    const parts = cleanedAuthorLine.split(/,\s*|\s+et\s+|\s+و\s+/);
    for (const p of parts) {
      let authorName = p
        .replace(/\b(Dr|Pr|Prof|Docteur|Professeur|Médecin)\b\.?/gi, '')
        .replace(/^[_\s|—=;:~]+/, '')
        .trim();
      // Capitalize author name cleanly
      if (authorName.length > 2) {
        authorName = authorName
          .split(' ')
          .map(w => (w.length > 1 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
          .join(' ');
      }
      if (authorName.length >= 3 && !authorName.toLowerCase().includes('hôpital')) {
        authors.push({
          id: `author-${authors.length + 1}`,
          name: authorName
        });
      }
    }
  }

  // Fallback search anywhere in OCR text
  if (authors.length === 0) {
    const authorLineMatch = cleanText.match(/Par\s+(?:les?\s+Docteurs?|MM?\.\s+les?\s+Professeurs?|le\s+Dr|les?\s+Drs?|le\s+Professeur|MM?\.)\s+([^,\n\r]+)/i) ||
      cleanText.match(/الدكتور(?:ان)?\s+([^,\n\r]+)/);
    
    if (authorLineMatch && authorLineMatch[1]) {
      const rawAuthors = authorLineMatch[1]
        .replace(/et\s+/gi, ', ')
        .replace(/\s+و\s+/g, ', ')
        .split(/,\s*|\s+et\s+/);

      for (const aName of rawAuthors) {
        const cleaned = aName.replace(/\b(Dr|Prof|Docteur|Professeur|Médecin)\b\.?/gi, '').trim();
        if (cleaned.length >= 3) {
          authors.push({
            id: `author-${authors.length + 1}`,
            name: cleaned
          });
        }
      }
    }
  }

  // 8. Subjects are looked up live on Wikidata after parsing (see lib/wikidata.ts), never guessed from a fixed list
  const subjects: SubjectRef[] = [];

  // Confidence estimation
  let confidence = 0.5;
  if (title && title.length > 20) confidence += 0.10;
  if (authors.length > 0 && authors[0].name.length > 5) confidence += 0.10;
  if (pageRecognizedFromOcr) confidence += 0.10;
  if (year >= 1903 && year <= 2026) confidence += 0.05;
  if (subjects.length > 0) confidence += 0.05;

  return {
    title: title.trim(),
    authors,
    journalName: 'La Tunisie Médicale',
    journalQid: 'Q3213360',
    publicationDate,
    datePrecision,
    volume,
    issue,
    firstPage,
    lastPage,
    pageRange,
    pageRecognizedFromOcr,
    ocrPageSnippet,
    pageEndDerivedFromNextUrl,
    pageDiffFormula,
    nextWorkUrl: hints?.nextUrl,
    language,
    languageQid,
    subjects,
    fullWorkUrl: hints?.url || '',
    abstractSnippet: lines.slice(4, 8).join(' ').slice(0, 240) + '...',
    confidenceScore: Math.min(confidence, 0.98),
    parsingEngine: 'offline_llm'
  };
}
