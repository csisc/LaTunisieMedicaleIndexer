export type VerificationStatus = 'not_done' | 'working' | 'verified' | 'done' | 'rejected';

export interface AuthorRef {
  id: string;
  name: string;
  wikidataId?: string; // e.g. "Q235187" for Charles Nicolle
  affiliation?: string; // e.g. "Institut Pasteur de Tunis"
}

export interface SubjectRef {
  id: string;
  name: string;
  wikidataId: string; // e.g. "Q12156" for Malaria
  category?: string;
}

export interface ParsedMetadata {
  title: string;
  titleArabic?: string;
  authors: AuthorRef[];
  journalName: string;
  journalQid: string; // Default Q3213360 (La Tunisie Médicale)
  publicationDate: string; // e.g. "1954-04-00" or "1954-00-00"
  datePrecision: 9 | 10 | 11; // 9 = year, 10 = month, 11 = day
  volume: string;
  issue: string;
  firstPage: string;
  lastPage: string;
  pageRange: string; // e.g. "9-14"
  pageRecognizedFromOcr?: boolean;
  ocrPageSnippet?: string;
  pageEndDerivedFromNextUrl?: boolean;
  pageDiffFormula?: string;
  nextWorkUrl?: string;
  language: 'fr' | 'ar' | 'en';
  languageQid: string; // Q150 (French), Q13955 (Arabic), Q1860 (English)
  subjects: SubjectRef[];
  fullWorkUrl: string;
  abstractSnippet?: string;
  confidenceScore: number; // 0 to 1
  parsingEngine: 'offline_llm' | 'gemini_flash' | 'manual';
}

export interface VerificationLog {
  isVerified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
  fieldChecks: {
    titleVerified: boolean;
    authorsVerified: boolean;
    dateVerified: boolean;
    volumeIssueVerified: boolean;
    pagesVerified: boolean;
    journalVerified: boolean;
  };
}

export interface ArticleRecord {
  id: string;
  rank?: number;
  year: number;
  era: 'before_1956' | 'after_1956';
  volume?: string;
  issue?: string;
  url: string;
  status: VerificationStatus;
  notes?: string;
  pageInVolume?: string;
  wikidataQid?: string | null; // e.g. "Q140609235"
  
  // OCR & Extracted Data
  ocrText?: string;
  firstPageImageUrl?: string;
  metadata?: ParsedMetadata;
  verification?: VerificationLog;
  
  updatedAt?: string;
}

export interface QuickStatementsExportOptions {
  batchName?: string;
  includeSubjectClaims: boolean;
  includeUrlClaim: boolean;
  includeLanguageClaim: boolean;
  useAuthorStringIfNoQid: boolean;
  targetWikidataItem?: string; // "LAST" or specific QID for update
}
