import React, { useState } from 'react';
import { Plus, Trash2, Search, ExternalLink, Type, Wand2, BookOpen, Calendar, FileText, CheckCircle2, UserCheck, Tag } from 'lucide-react';
import { ParsedMetadata, AuthorRef, SubjectRef } from '../types/article';
import { AuthorReconcileModal } from './AuthorReconcileModal';

interface MetadataEditorProps {
  metadata: ParsedMetadata;
  onChange: (updated: ParsedMetadata) => void;
}

export const MetadataEditor: React.FC<MetadataEditorProps> = ({ metadata, onChange }) => {
  const [reconcileAuthor, setReconcileAuthor] = useState<AuthorRef | null>(null);

  // Helper title tools
  const handleTitleCase = () => {
    const raw = metadata.title.trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    const formatted = lower.charAt(0).toUpperCase() + lower.slice(1);
    onChange({ ...metadata, title: formatted });
  };

  const handleFixAccents = () => {
    // Normalizes common OCR ligature and accent quirks in French/Latin
    let fixed = metadata.title
      .replace(/oe/g, 'œ')
      .replace(/Ae/g, 'Æ')
      .replace(/É/g, 'É')
      .replace(/\s+/g, ' ')
      .trim();
    onChange({ ...metadata, title: fixed });
  };

  // Author management
  const handleAddAuthor = () => {
    const newAuthor: AuthorRef = {
      id: `author-${Date.now()}`,
      name: '',
    };
    onChange({
      ...metadata,
      authors: [...metadata.authors, newAuthor],
    });
  };

  const handleUpdateAuthor = (id: string, updates: Partial<AuthorRef>) => {
    onChange({
      ...metadata,
      authors: metadata.authors.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    });
  };

  const handleRemoveAuthor = (id: string) => {
    onChange({
      ...metadata,
      authors: metadata.authors.filter((a) => a.id !== id),
    });
  };

  // Subject management
  const handleAddSubject = (name: string, wikidataId: string) => {
    if (metadata.subjects.some((s) => s.wikidataId === wikidataId)) return;
    const newSubj: SubjectRef = {
      id: `subj-${Date.now()}`,
      name,
      wikidataId,
    };
    onChange({
      ...metadata,
      subjects: [...metadata.subjects, newSubj],
    });
  };

  const handleRemoveSubject = (id: string) => {
    onChange({
      ...metadata,
      subjects: metadata.subjects.filter((s) => s.id !== id),
    });
  };

  // Page range auto-sync
  const handleFirstPageChange = (val: string) => {
    const firstP = val.trim();
    const lastP = metadata.lastPage || firstP;
    const range = firstP ? (lastP && lastP !== firstP ? `${firstP}-${lastP}` : firstP) : '';
    onChange({
      ...metadata,
      firstPage: firstP,
      pageRange: range,
    });
  };

  const handleLastPageChange = (val: string) => {
    const lastP = val.trim();
    const firstP = metadata.firstPage || '';
    const range = firstP ? (lastP && lastP !== firstP ? `${firstP}-${lastP}` : firstP) : lastP;
    onChange({
      ...metadata,
      lastPage: lastP,
      pageRange: range,
    });
  };

  const popularSubjects = [
    { name: 'Paludisme (Malaria)', qid: 'Q12156' },
    { name: 'Tuberculose', qid: 'Q12204' },
    { name: 'Trachome', qid: 'Q193215' },
    { name: 'Peste bubonique', qid: 'Q134990' },
    { name: 'Pédiatrie', qid: 'Q11190' },
    { name: 'Santé publique', qid: 'Q189603' },
    { name: 'Histoire de la médecine', qid: 'Q849479' },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Titre de l'article (P1476) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>Titre de l'article (P1476)</span>
          </label>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={handleTitleCase}
              className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors flex items-center space-x-1 cursor-pointer"
              title="Formater la première lettre en majuscule"
            >
              <Type className="w-3 h-3" />
              <span>Casse Titre</span>
            </button>
            <button
              type="button"
              onClick={handleFixAccents}
              className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors flex items-center space-x-1 cursor-pointer"
              title="Nettoyer les ligatures et accents"
            >
              <Wand2 className="w-3 h-3" />
              <span>Nettoyer</span>
            </button>
          </div>
        </div>
        <textarea
          rows={2}
          value={metadata.title}
          onChange={(e) => onChange({ ...metadata, title: e.target.value })}
          placeholder="ex: Enquête épidémiologique sur le paludisme dans la région du Cap-Bon"
          className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* 2. Auteurs (P50 ou P2093) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Auteurs (P50: Élément Wikidata / P2093: Chaîne)</span>
          </label>
          <button
            type="button"
            onClick={handleAddAuthor}
            className="text-[11px] px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors flex items-center space-x-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Ajouter auteur</span>
          </button>
        </div>

        <div className="space-y-2">
          {metadata.authors.map((author, index) => (
            <div
              key={author.id}
              className="p-3 bg-slate-800/70 border border-slate-700/80 rounded-xl space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 w-5">#{index + 1}</span>
                <input
                  type="text"
                  value={author.name}
                  onChange={(e) => handleUpdateAuthor(author.id, { name: e.target.value })}
                  placeholder="Nom de l'auteur (ex: Ahmed Ben Miled)"
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100"
                />

                {/* Reconcile button / QID badge */}
                {author.wikidataId ? (
                  <div className="flex items-center space-x-1">
                    <a
                      href={`https://www.wikidata.org/wiki/${author.wikidataId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded text-xs font-mono bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center space-x-1"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>{author.wikidataId}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleUpdateAuthor(author.id, { wikidataId: undefined })}
                      className="p-1 text-slate-400 hover:text-rose-300"
                      title="Détacher le QID"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReconcileAuthor(author)}
                    className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-indigo-300 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer shrink-0"
                    title="Rechercher sur Wikidata pour lier P50"
                  >
                    <Search className="w-3 h-3" />
                    <span>Lier Wikidata</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveAuthor(author.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Affiliation input */}
              <input
                type="text"
                value={author.affiliation || ''}
                onChange={(e) => handleUpdateAuthor(author.id, { affiliation: e.target.value })}
                placeholder="Affiliation / Fonction (ex: Hôpitaux de Tunis, Institut Pasteur)"
                className="w-full px-3 py-1 bg-slate-900/60 border border-slate-700/60 rounded-md text-[11px] text-slate-300 placeholder-slate-500"
              />
            </div>
          ))}

          {metadata.authors.length === 0 && (
            <div className="p-3 bg-slate-800/40 border border-dashed border-slate-700 rounded-xl text-xs text-slate-400 text-center">
              Aucun auteur renseigné. Cliquez sur « Ajouter auteur ».
            </div>
          )}
        </div>
      </div>

      {/* 3. Journal, Date, Volume, Numéro, Pages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Journal (P1433) */}
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
            <BookOpen className="w-3 h-3 text-indigo-400" />
            <span>Revue / Journal (P1433)</span>
          </label>
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200">
            <span className="font-semibold text-white">La Tunisie Médicale</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800">
              Q3213360
            </span>
          </div>
        </div>

        {/* Date de publication (P577) */}
        <div className="space-y-1 sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-indigo-400" />
              <span>Date de publication (P577)</span>
            </label>
            <select
              value={metadata.datePrecision}
              onChange={(e) => onChange({ ...metadata, datePrecision: parseInt(e.target.value) as any })}
              className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 rounded px-1.5 py-0.5"
            >
              <option value={9}>Précision: Année (/9)</option>
              <option value={10}>Précision: Mois (/10)</option>
              <option value={11}>Précision: Jour (/11)</option>
            </select>
          </div>
          <input
            type="text"
            value={metadata.publicationDate}
            onChange={(e) => onChange({ ...metadata, publicationDate: e.target.value })}
            placeholder="ex: 1954-01-00"
            className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono"
          />
        </div>

        {/* Volume (P478) */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">Volume (P478)</label>
          <input
            type="text"
            value={metadata.volume}
            onChange={(e) => onChange({ ...metadata, volume: e.target.value })}
            placeholder="ex: 32"
            className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100"
          />
        </div>

        {/* Numéro / Issue (P433) */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">Numéro (P433)</label>
          <input
            type="text"
            value={metadata.issue}
            onChange={(e) => onChange({ ...metadata, issue: e.target.value })}
            placeholder="ex: 1 ou 1-2"
            className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100"
          />
        </div>

        {/* Page Début (P304) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">Page début (P304)</label>
            {metadata.pageRecognizedFromOcr && (
              <span
                className="text-[10px] px-1.5 py-0.2 bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 rounded font-medium"
                title={metadata.ocrPageSnippet ? `Reconnue dans : "${metadata.ocrPageSnippet}"` : "Reconnue directement dans le texte de l'OCR"}
              >
                Reconnue de l'OCR
              </span>
            )}
          </div>
          <input
            type="text"
            value={metadata.firstPage}
            onChange={(e) => handleFirstPageChange(e.target.value)}
            placeholder="ex: 21"
            className={`w-full px-3 py-1.5 bg-slate-800 border rounded-lg text-xs text-slate-100 font-mono ${
              metadata.pageRecognizedFromOcr ? 'border-emerald-600/60 focus:ring-emerald-500' : 'border-slate-700'
            }`}
          />
        </div>

        {/* Page Fin */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">
            Page fin {metadata.pageRange ? `(Plage: ${metadata.pageRange})` : ''}
          </label>
          <input
            type="text"
            value={metadata.lastPage}
            onChange={(e) => handleLastPageChange(e.target.value)}
            placeholder="ex: 28"
            className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono"
          />
        </div>
      </div>

      {/* 4. Langue du travail (P407) */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300">Langue du travail (P407)</label>
        <div className="flex gap-3">
          {[
            { label: 'Français (Q150)', code: 'fr', qid: 'Q150' },
            { label: 'العربية (Q13955)', code: 'ar', qid: 'Q13955' },
            { label: 'English (Q1860)', code: 'en', qid: 'Q1860' },
          ].map((lang) => (
            <label
              key={lang.code}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                metadata.language === lang.code
                  ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <input
                type="radio"
                name="articleLanguage"
                checked={metadata.language === lang.code}
                onChange={() =>
                  onChange({
                    ...metadata,
                    language: lang.code as any,
                    languageQid: lang.qid,
                  })
                }
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>{lang.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 5. Sujets médicaux (P921) */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
          <Tag className="w-3.5 h-3.5 text-indigo-400" />
          <span>Sujets principaux / Pathologies (P921)</span>
        </label>

        {/* Selected Subjects Tags */}
        <div className="flex flex-wrap gap-2">
          {metadata.subjects.map((subj) => (
            <span
              key={subj.id}
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs bg-slate-800 text-slate-200 border border-slate-700 space-x-1.5"
            >
              <span className="font-medium">{subj.name}</span>
              <span className="font-mono text-[10px] text-amber-300">({subj.wikidataId})</span>
              <button
                type="button"
                onClick={() => handleRemoveSubject(subj.id)}
                className="text-slate-400 hover:text-rose-400"
              >
                &times;
              </button>
            </span>
          ))}
        </div>

        {/* Quick Suggestions */}
        <div className="pt-1 flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-slate-500">Ajouter rapidement :</span>
          {popularSubjects.map((ps) => (
            <button
              key={ps.qid}
              type="button"
              onClick={() => handleAddSubject(ps.name, ps.qid)}
              className="text-[11px] px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors cursor-pointer"
            >
              + {ps.name}
            </button>
          ))}
        </div>
      </div>

      {/* 6. URL du texte complet (P953) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300">
            Lien texte intégral / Lecteur Archives (P953)
          </label>
          {metadata.fullWorkUrl && (
            <a
              href={metadata.fullWorkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center space-x-1"
            >
              <span>Tester le lien</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <input
          type="url"
          value={metadata.fullWorkUrl}
          onChange={(e) => onChange({ ...metadata, fullWorkUrl: e.target.value })}
          placeholder="https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/..."
          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono"
        />
      </div>

      {/* Author Reconciliation Modal */}
      {reconcileAuthor && (
        <AuthorReconcileModal
          author={reconcileAuthor}
          isOpen={!!reconcileAuthor}
          onClose={() => setReconcileAuthor(null)}
          onSelectEntity={(authorId, qid, name) => {
            handleUpdateAuthor(authorId, {
              wikidataId: qid,
              name: name || undefined,
            });
          }}
        />
      )}
    </div>
  );
};
