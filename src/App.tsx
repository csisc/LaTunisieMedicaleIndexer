import React, { useState, useRef } from 'react';
import {
  Sparkles,
  ExternalLink,
  BookOpen,
  Copy,
  Check,
  CheckCircle2,
  FileCode,
  ShieldCheck,
  RotateCw,
  Search,
  Eye,
  Loader2,
  Layers,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  FileText,
  Upload,
} from 'lucide-react';
import { MetadataEditor } from './components/MetadataEditor';
import { ProjectGuidelinesModal } from './components/ProjectGuidelinesModal';
import { WikidataItemPreview } from './components/WikidataItemPreview';
import { ParsedMetadata, ArticleRecord } from './types/article';
import {
  generateQuickStatementsForArticle,
  getToolforgeQuickStatementsUrl,
  validateQuickStatements,
  generateWikitextTableRow,
} from './utils/quickstatements';
import { LandingPage } from './components/LandingPage';
import { CollectionQueue } from './components/CollectionQueue';
import { CollectionId, getNext, markCreated } from './api';
import { processArchiveUrl, processImageFile, ScanNotReadableError } from './lib/pipeline';

const COLLECTION_LABELS: Record<CollectionId, { label: string; wiki: string }> = {
  before_1956: {
    label: 'Avant 1956',
    wiki: 'https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation/Before_1956',
  },
  main_page: {
    label: 'Page principale',
    wiki: 'https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation',
  },
};

const readHash = (): CollectionId | null => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h === 'before_1956' || h === 'main_page' ? h : null;
};

export default function App() {
  // Step 1: URL input
  const [urlInput, setUrlInput] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 & 3: Loading & Processing states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result data from Real OCR & Processing
  const [scanImageUrl, setScanImageUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [metadata, setMetadata] = useState<ParsedMetadata | null>(null);
  const [wikiProjectInfo, setWikiProjectInfo] = useState<any | null>(null);

  // Step 4: Human validation
  const [isValidated, setIsValidated] = useState<boolean>(false);
  const [copiedQs, setCopiedQs] = useState<boolean>(false);
  const [copiedWiki, setCopiedWiki] = useState<boolean>(false);

  // Optional preview & guidelines modals
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState<boolean>(false);
  const [showCatalogDrawer, setShowCatalogDrawer] = useState<boolean>(true);

  // Landing page choice (null = landing page), kept in the URL hash so a reload keeps the place
  const [collection, setCollection] = useState<CollectionId | null>(readHash);
  const [queueRefresh, setQueueRefresh] = useState<number>(0);
  const [createdQid, setCreatedQid] = useState<string>('');
  const [markState, setMarkState] = useState<string>('');

  React.useEffect(() => {
    const onHash = () => setCollection(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const chooseCollection = (id: CollectionId | null) => {
    window.location.hash = id ? `/${id}` : '';
    setCollection(id);
  };

  const resetWorkspace = () => {
    setMetadata(null);
    setOcrText('');
    setScanImageUrl(null);
    setWikiProjectInfo(null);
    setIsValidated(false);
    setCreatedQid('');
    setMarkState('');
  };

  // The user created the Wikidata item: drop the page from the CSV queue right away and go to the next one
  const handleMarkCreated = async () => {
    try {
      await markCreated(urlInput, createdQid.trim().toUpperCase() || undefined);
      setQueueRefresh((n) => n + 1);
      if (collection) {
        const { item } = await getNext(collection, urlInput);
        resetWorkspace();
        if (item) {
          setUrlInput(item.url);
          handleProcessUrl(item.url);
        }
      }
    } catch (e: any) {
      setMarkState(e.message || 'Erreur');
    }
  };

  // Scan provided by the user (file picker, drag & drop or paste): OCR + parsing run in the browser
  const handleImageBlob = async (file: Blob) => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsValidated(false);
    try {
      const r = await processImageFile(file, urlInput.trim(), setLoadingStep);
      setScanImageUrl(r.imageUrl);
      setOcrText(r.ocrText);
      setMetadata(r.metadata);
      setWikiProjectInfo(r.wikiProjectInfo);
    } catch (err: any) {
      console.error('Image process error:', err);
      setErrorMessage(err.message || 'Erreur lors du traitement du scan.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleImageBlob(file);
  };

  // Ctrl+V of a screenshot / copied image
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        handleImageBlob(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Archive URL -> scan -> OCR -> metadata (everything in the browser, no server)
  const handleProcessUrl = async (targetUrl?: string) => {
    const urlToProcess = (targetUrl || urlInput).trim();
    if (!urlToProcess) {
      setErrorMessage("Veuillez saisir une URL valide des Archives Nationales (search.archives.nat.tn).");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsValidated(false);
    setMetadata(null);
    setScanImageUrl(null);

    try {
      const r = await processArchiveUrl(urlToProcess, setLoadingStep, setScanImageUrl);
      setScanImageUrl(r.imageUrl);
      setOcrText(r.ocrText);
      setMetadata(r.metadata);
      setWikiProjectInfo(r.wikiProjectInfo);
    } catch (err: any) {
      console.error('Process error:', err);
      setErrorMessage(err.message || "Une erreur est survenue lors de l'extraction OCR.");
      if (!(err instanceof ScanNotReadableError)) setScanImageUrl(null);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // QuickStatements generator
  const qsCode = metadata
    ? generateQuickStatementsForArticle(metadata, {
        includeSubjectClaims: true,
        includeUrlClaim: true,
        includeLanguageClaim: true,
        useAuthorStringIfNoQid: true,
      })
    : '';

  const validation = qsCode ? validateQuickStatements(qsCode) : null;
  const toolforgeUrl = qsCode ? getToolforgeQuickStatementsUrl(qsCode) : '';

  const handleCopyQs = async () => {
    if (!qsCode) return;
    await navigator.clipboard.writeText(qsCode);
    setCopiedQs(true);
    setTimeout(() => setCopiedQs(false), 2000);
  };

  const handleCopyWikiLine = async () => {
    if (!metadata) return;
    const dummyRecord: ArticleRecord = {
      id: 'active',
      year: parseInt(metadata.publicationDate.slice(0, 4), 10) || 1954,
      era: (parseInt(metadata.publicationDate.slice(0, 4), 10) || 1954) < 1956 ? 'before_1956' : 'after_1956',
      url: urlInput,
      status: isValidated ? 'verified' : 'not_done',
      metadata,
      rank: wikiProjectInfo?.rank || 1,
    };
    const row = generateWikitextTableRow(dummyRecord);
    await navigator.clipboard.writeText(row);
    setCopiedWiki(true);
    setTimeout(() => setCopiedWiki(false), 2000);
  };

  if (!collection) {
    return (
      <>
        <LandingPage onChoose={chooseCollection} onOpenGuidelines={() => setIsGuidelinesOpen(true)} />
        {isGuidelinesOpen && <ProjectGuidelinesModal isOpen={isGuidelinesOpen} onClose={() => setIsGuidelinesOpen(false)} />}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600 via-rose-700 to-indigo-900 flex items-center justify-center text-white font-bold text-lg shadow-inner border border-red-400/30">
              TM
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-base sm:text-lg text-slate-100 tracking-tight">
                  La Tunisie Médicale
                </h1>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-red-950 text-red-300 border border-red-800 rounded">
                  {COLLECTION_LABELS[collection].label}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Reconnaissance OCR réelle &bull; Dérivation des métadonnées &bull; Export QuickStatements
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={() => chooseCollection(null)}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              ← Changer de liste
            </button>

            <button
              onClick={() => setIsGuidelinesOpen(true)}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Guide du projet</span>
            </button>

            <a
              href={COLLECTION_LABELS[collection].wiki}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center space-x-1 transition-colors"
            >
              <span>Page Wiki</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Simplified Workflow */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* STEP 1: Enter the URL */}
        <section
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'));
            if (f) {
              e.preventDefault();
              handleImageBlob(f);
            }
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>Coller le lien de l'article (search.archives.nat.tn)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Le système récupère automatiquement le scan haute résolution, exécute l'OCR et extrait les métadonnées.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCatalogDrawer(!showCatalogDrawer)}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 self-start sm:self-auto cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{showCatalogDrawer ? 'Masquer la liste' : 'Choisir dans la liste restante'}</span>
              {showCatalogDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* URL Input Form */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleProcessUrl();
              }}
              placeholder="https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/23/mode/2up"
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
            />

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Importer un fichier scan image (.jpg, .png)"
              className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Upload className="w-4 h-4 text-indigo-400" />
              <span className="hidden md:inline">Scan image</span>
            </button>

            <button
              type="button"
              onClick={() => handleProcessUrl()}
              disabled={isLoading || !urlInput.trim()}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-950/60 flex items-center justify-center space-x-2 transition-all cursor-pointer shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Traitement en cours...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Extraire le scan &amp; OCR</span>
                </>
              )}
            </button>
          </div>

          {/* Expandable Project Articles Browser Drawer */}
          {showCatalogDrawer && (
            <CollectionQueue
              collection={collection}
              refreshKey={queueRefresh}
              activeUrl={urlInput}
              onPick={(item) => {
                setUrlInput(item.url);
                handleProcessUrl(item.url);
              }}
            />
          )}
        </section>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs sm:text-sm text-rose-200 flex items-center justify-between">
            <span>
              {errorMessage}
              {scanImageUrl && !metadata && (
                <a
                  href={scanImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="ml-2 underline text-sky-300 hover:text-sky-200 whitespace-nowrap"
                >
                  Ouvrir le scan
                </a>
              )}
            </span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200 font-bold">
              &times;
            </button>
          </div>
        )}

        {/* Loading Visualizer (Steps 2 & 3) */}
        {isLoading && (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4 shadow-xl">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
            <div className="font-semibold text-base text-slate-100">{loadingStep}</div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Tout se passe dans votre navigateur : le scan est téléchargé puis analysé localement, sans serveur intermédiaire.
            </p>
          </div>
        )}

        {/* STEP 4: The user gets the data and validates it */}
        {metadata && !isLoading && (
          <section className="space-y-6">
            {/* Step header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <span>Vérification &amp; Validation des données extraites</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>Toutes les métadonnées sont extraites du texte OCR réel et des tables du projet.</span>
                  {metadata.pageRecognizedFromOcr && (
                    <span
                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px] font-semibold"
                      title={metadata.ocrPageSnippet ? `Identifiée dans : "${metadata.ocrPageSnippet}"` : "Page reconnue directement dans le texte OCR"}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Page {metadata.firstPage} reconnue depuis l'OCR</span>
                    </span>
                  )}
                </p>
              </div>

              {/* Validation Checkbox */}
              <label className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isValidated}
                  onChange={(e) => setIsValidated(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-semibold text-emerald-300">
                  {isValidated ? 'Données vérifiées par un humain' : 'Confirmer la vérification'}
                </span>
              </label>
            </div>

            {/* Split Screen Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Real Scanned Page + Verbatim OCR Text + Meta-Wiki Card (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Real Scan Image Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Première page numérisée (ANT)</span>
                    </span>
                    <a
                      href={urlInput}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center space-x-1"
                    >
                      <span>Ouvrir dans ANT</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-2 flex items-center justify-center min-h-[380px] max-h-[500px] overflow-hidden">
                    {scanImageUrl ? (
                      <img
                        src={scanImageUrl}
                        referrerPolicy="no-referrer"
                        alt="Scan original de la page"
                        className="max-h-[480px] object-contain rounded-lg shadow-md"
                      />
                    ) : (
                      <div className="text-center text-slate-500 text-xs">
                        <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <span>Scan en attente</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Verbatim OCR Output */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Texte OCR Brut
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {ocrText.length} caractères
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    placeholder="Le texte OCR réel s'affiche ici..."
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Meta-Wiki Information Card if matched */}
                {wikiProjectInfo && (
                  <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl text-xs space-y-1">
                    <div className="font-semibold text-indigo-300 flex items-center space-x-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Référencé dans la page Meta-Wiki ({wikiProjectInfo.source})</span>
                    </div>
                    <div className="text-slate-300">
                      Année : <strong className="text-white">{wikiProjectInfo.year}</strong> &bull; Rang : <strong className="text-white">#{wikiProjectInfo.rank || '—'}</strong> &bull; Statut wiki : <strong className="text-amber-300">{wikiProjectInfo.status}</strong>
                    </div>
                    {wikiProjectInfo.qid && (
                      <div className="text-emerald-400 font-mono">
                        Identifiant existant : {wikiProjectInfo.qid}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Editable Metadata + QuickStatements Export (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Form to Edit & Validate Parsed Fields */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Champs bibliographiques extraits de l'OCR</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setIsPreviewOpen(true)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Simuler sur Wikidata</span>
                    </button>
                  </div>

                  {/* Metadata Editor Component */}
                  <MetadataEditor metadata={metadata} onChange={setMetadata} />
                </div>

                {/* QuickStatements V2 Export Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                        <FileCode className="w-4 h-4 text-emerald-400" />
                        <span>Export QuickStatements V2</span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        Prêt pour création immédiate sur Wikidata
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleCopyQs}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border border-slate-700"
                      >
                        {copiedQs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedQs ? 'Copié !' : 'Copier QS'}</span>
                      </button>

                      <a
                        href={toolforgeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow transition-all"
                      >
                        <span>Ouvrir dans Toolforge</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* QuickStatements Code Viewer */}
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap select-all leading-relaxed">{qsCode}</pre>
                  </div>

                  {/* Item created -> leave the CSV queue */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800 text-xs">
                    <span className="text-slate-400">
                      Élément créé sur Wikidata ? Retirez cette page de la liste :
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        value={createdQid}
                        onChange={(e) => setCreatedQid(e.target.value)}
                        placeholder="QID (facultatif)"
                        className="px-2 py-1 bg-slate-950 border border-slate-700 rounded-md text-xs text-slate-200 w-32 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleMarkCreated}
                        className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-md font-semibold cursor-pointer"
                      >
                        Créé · page suivante
                      </button>
                    </div>
                  </div>
                  {markState && <p className="text-xs text-rose-300">{markState}</p>}

                  {/* Wikitext Row for Meta-Wiki page update */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800 text-xs">
                    <span className="text-slate-400">
                      Mettre à jour le tableau sur Wikidata :
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyWikiLine}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-md transition-colors flex items-center space-x-1 cursor-pointer self-start sm:self-auto"
                    >
                      {copiedWiki ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedWiki ? 'Copié !' : 'Copier la ligne Wikitexte'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-4 px-4 text-xs text-slate-400 text-center">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>La Tunisie Médicale &bull; Wikidata Arabic Community Indexation Tool</span>
          <a
            href="https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:underline flex items-center space-x-1"
          >
            <span>Projet Wikidata</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>

      {/* Modals */}
      {metadata && isPreviewOpen && (
        <WikidataItemPreview
          article={{
            id: 'preview',
            year: parseInt(metadata.publicationDate.slice(0, 4), 10) || 1954,
            era: (parseInt(metadata.publicationDate.slice(0, 4), 10) || 1954) < 1956 ? 'before_1956' : 'after_1956',
            url: urlInput,
            status: 'verified',
            metadata,
          }}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}

      {isGuidelinesOpen && (
        <ProjectGuidelinesModal
          isOpen={isGuidelinesOpen}
          onClose={() => setIsGuidelinesOpen(false)}
        />
      )}
    </div>
  );
}
