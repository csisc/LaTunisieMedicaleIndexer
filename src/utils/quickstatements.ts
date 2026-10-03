import { ArticleRecord, ParsedMetadata, QuickStatementsExportOptions } from '../types/article';

export interface QuickStatementsValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Escapes double quotes in string for QuickStatements V2
 */
function escapeQs(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Format date for QuickStatements P577 with precision
 * Precision 9 = Year: +YYYY-00-00T00:00:00Z/9
 * Precision 10 = Month: +YYYY-MM-00T00:00:00Z/10
 * Precision 11 = Day: +YYYY-MM-DDT00:00:00Z/11
 */
function formatQsDate(dateStr: string, precision: 9 | 10 | 11 = 9): string {
  if (!dateStr) return '+1954-00-00T00:00:00Z/9';
  
  const parts = dateStr.split('-');
  const year = parts[0] || '1954';
  const month = (parts[1] && parts[1] !== '00') ? parts[1].padStart(2, '0') : '00';
  const day = (parts[2] && parts[2] !== '00') ? parts[2].padStart(2, '0') : '00';

  if (month === '00' || precision === 9) {
    return `+${year}-00-00T00:00:00Z/9`;
  } else if (day === '00' || precision === 10) {
    return `+${year}-${month}-00T00:00:00Z/10`;
  } else {
    return `+${year}-${month}-${day}T00:00:00Z/11`;
  }
}

/**
 * Generate QuickStatements V2 commands for a single article
 */
export function generateQuickStatementsForArticle(
  metadata: ParsedMetadata,
  options: QuickStatementsExportOptions = {
    includeSubjectClaims: true,
    includeUrlClaim: true,
    includeLanguageClaim: true,
    useAuthorStringIfNoQid: true
  }
): string {
  const lines: string[] = [];
  const target = options.targetWikidataItem || 'CREATE';
  
  if (target === 'CREATE') {
    lines.push('CREATE');
  }

  const itemId = target === 'CREATE' ? 'LAST' : target;

  // P31: instance of -> scholarly article (Q13442814)
  lines.push(`${itemId}|P31|Q13442814`);

  // P1476: title (monolingual text)
  const langCode = metadata.language || 'fr';
  lines.push(`${itemId}|P1476|${langCode}:"${escapeQs(metadata.title)}"`);

  // Labels & Descriptions in fr, ar, en
  if (langCode === 'fr') {
    lines.push(`${itemId}|Lfr:"${escapeQs(metadata.title)}"`);
    lines.push(`${itemId}|Dfr:"Article scientifique de La Tunisie Médicale"`);
    lines.push(`${itemId}|Den:"A scholarly publication in La Tunisie Médicale"`);
    lines.push(`${itemId}|Dar:"مقال علمي في المجلة الطبية التونسية"`);
  } else if (langCode === 'ar') {
    lines.push(`${itemId}|Lar:"${escapeQs(metadata.title)}"`);
    lines.push(`${itemId}|Dar:"مقال علمي في المجلة الطبية التونسية"`);
    lines.push(`${itemId}|Dfr:"Article scientifique de La Tunisie Médicale"`);
    lines.push(`${itemId}|Den:"A scholarly publication in La Tunisie Médicale"`);
  } else {
    lines.push(`${itemId}|Len:"${escapeQs(metadata.title)}"`);
    lines.push(`${itemId}|Den:"A scholarly publication in La Tunisie Médicale"`);
  }

  // P1433: published in -> La Tunisie Médicale (Q3213360)
  const journalQid = metadata.journalQid || 'Q3213360';
  lines.push(`${itemId}|P1433|${journalQid}`);

  // P577: publication date
  lines.push(`${itemId}|P577|${formatQsDate(metadata.publicationDate, metadata.datePrecision)}`);

  // P478: volume
  if (metadata.volume) {
    lines.push(`${itemId}|P478|"${escapeQs(metadata.volume)}"`);
  }

  // P433: issue
  if (metadata.issue) {
    lines.push(`${itemId}|P433|"${escapeQs(metadata.issue)}"`);
  }

  // P304: page(s)
  const pageRange = metadata.pageRange || (metadata.firstPage ? `${metadata.firstPage}-${metadata.lastPage || metadata.firstPage}` : '');
  if (pageRange) {
    lines.push(`${itemId}|P304|"${escapeQs(pageRange)}"`);
  }

  // P407: language of work or name (Q150 French, Q13955 Arabic, Q1860 English)
  if (options.includeLanguageClaim) {
    const langQid = metadata.languageQid || (metadata.language === 'ar' ? 'Q13955' : 'Q150');
    lines.push(`${itemId}|P407|${langQid}`);
  }

  // Authors: P50 (author item) or P2093 (author name string)
  if (metadata.authors && metadata.authors.length > 0) {
    metadata.authors.forEach((author, index) => {
      if (author.wikidataId && author.wikidataId.startsWith('Q')) {
        // Link directly to author Wikidata QID with series ordinal qualifier if multiple
        const qual = metadata.authors.length > 1 ? `|P1545|"${index + 1}"` : '';
        lines.push(`${itemId}|P50|${author.wikidataId}${qual}`);
      } else if (options.useAuthorStringIfNoQid && author.name) {
        const qual = metadata.authors.length > 1 ? `|P1545|"${index + 1}"` : '';
        lines.push(`${itemId}|P2093|"${escapeQs(author.name)}"${qual}`);
      }
    });
  }

  // P921: main subject
  if (options.includeSubjectClaims && metadata.subjects && metadata.subjects.length > 0) {
    metadata.subjects.forEach(subject => {
      if (subject.wikidataId && subject.wikidataId.startsWith('Q')) {
        lines.push(`${itemId}|P921|${subject.wikidataId}`);
      }
    });
  }

  // P953: full work available at URL (National Archives reader link)
  if (options.includeUrlClaim && metadata.fullWorkUrl) {
    lines.push(`${itemId}|P953|"${escapeQs(metadata.fullWorkUrl)}"`);
  }

  return lines.join('\n');
}

/**
 * Generate QuickStatements for a batch of articles
 */
export function generateQuickStatementsBatch(
  articles: ArticleRecord[],
  options?: QuickStatementsExportOptions
): string {
  const blocks: string[] = [];

  for (const art of articles) {
    if (art.metadata) {
      blocks.push(generateQuickStatementsForArticle(art.metadata, options));
    }
  }

  return blocks.join('\n\n');
}

/**
 * Create a direct URL to open QuickStatements in Toolforge
 */
export function getToolforgeQuickStatementsUrl(qsText: string): string {
  const encoded = encodeURIComponent(qsText);
  return `https://quickstatements.toolforge.org/#/v1=${encoded}`;
}

/**
 * Validates QuickStatements input for common formatting problems
 */
export function validateQuickStatements(qsText: string): QuickStatementsValidationResult {
  const lines = qsText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
  const errors: string[] = [];
  const warnings: string[] = [];

  if (lines.length === 0) {
    errors.push("Empty QuickStatements commands.");
    return { isValid: false, warnings, errors };
  }

  let hasCreate = false;
  let hasTitle = false;
  let hasJournal = false;
  let hasDate = false;

  for (const line of lines) {
    if (line === 'CREATE') {
      hasCreate = true;
      continue;
    }

    const parts = line.split('|');
    if (parts.length < 3) {
      warnings.push(`Malformed statement line (missing pipes): "${line}"`);
      continue;
    }

    const prop = parts[1];
    if (prop === 'P1476') hasTitle = true;
    if (prop === 'P1433') hasJournal = true;
    if (prop === 'P577') hasDate = true;

    // Check quotes on strings
    if (['P1476', 'P478', 'P433', 'P304', 'P2093', 'P953'].includes(prop)) {
      const val = parts[2];
      if (!val.includes('"')) {
        warnings.push(`Property ${prop} usually expects a quoted string value: "${val}"`);
      }
    }
  }

  if (!hasCreate && !qsText.includes('Q')) {
    warnings.push("No 'CREATE' command found at the start of new item creation.");
  }
  if (!hasTitle) {
    errors.push("Missing P1476 (title) statement.");
  }
  if (!hasJournal) {
    warnings.push("Missing P1433 (published in) statement.");
  }
  if (!hasDate) {
    warnings.push("Missing P577 (publication date) statement.");
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * Generate Wikitext row to update the Wikidata Arabic Community project page table
 * e.g. | 1954 || 32 || 1 || [URL Link] || {{done}} || {{Q|140609235}}
 */
export function generateWikitextTableRow(article: ArticleRecord): string {
  const year = article.year;
  const vol = article.metadata?.volume || article.volume || '';
  const issue = article.metadata?.issue || article.issue || '';
  const url = article.url;
  const statusWikitext = article.status === 'done'
    ? '{{done}}'
    : article.status === 'verified'
      ? '{{working}} (Verified)'
      : '{{not done}}';

  const notesWikitext = article.wikidataQid
    ? `{{Q|${article.wikidataQid.replace('Q', '')}}}`
    : (article.metadata?.title ? `Title: ${article.metadata.title.slice(0, 40)}...` : 'None');

  if (article.era === 'before_1956') {
    return `|- \n| ${article.rank || 1} || [${url} Link] || ${statusWikitext} || ${notesWikitext}`;
  } else {
    return `|- \n| ${year} || ${vol} || ${issue} || [${url} Link] || ${statusWikitext} || ${notesWikitext}`;
  }
}

/**
 * Generate BibTeX entry
 */
export function generateBibTeX(metadata: ParsedMetadata): string {
  const key = `tunisiemed_${metadata.publicationDate.slice(0, 4)}_${(metadata.authors[0]?.name || 'article').toLowerCase().replace(/[^a-z]/g, '')}`;
  const authorsStr = metadata.authors.map(a => a.name).join(' and ');
  return `@article{${key},
  title = {${metadata.title}},
  author = {${authorsStr}},
  journal = {La Tunisie M{\\'e}dicale},
  year = {${metadata.publicationDate.slice(0, 4)}},
  volume = {${metadata.volume}},
  number = {${metadata.issue}},
  pages = {${metadata.pageRange}},
  url = {${metadata.fullWorkUrl}}
}`;
}
