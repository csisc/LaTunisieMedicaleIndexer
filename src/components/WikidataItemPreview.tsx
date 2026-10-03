import React from 'react';
import { X, ExternalLink, Globe, BookOpen, User, Calendar, Tag, ShieldCheck, Sparkles } from 'lucide-react';
import { ArticleRecord, ParsedMetadata } from '../types/article';

interface WikidataItemPreviewProps {
  article: ArticleRecord;
  isOpen: boolean;
  onClose: () => void;
}

export const WikidataItemPreview: React.FC<WikidataItemPreviewProps> = ({
  article,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !article.metadata) return null;

  const meta = article.metadata;
  const qidDisplay = article.wikidataQid || 'Q(Nouvel élément)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header styled like Wikidata */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1 font-serif text-lg font-bold text-slate-100">
              <span className="text-red-500">W</span>
              <span className="text-emerald-500">I</span>
              <span className="text-sky-500">K</span>
              <span className="text-amber-500">I</span>
              <span className="text-slate-100">DATA</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              Simulateur d'entité
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body imitating Wikidata */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900 text-slate-200">
          {/* Item Title & QID */}
          <div className="border-b border-slate-800 pb-4">
            <div className="flex items-baseline space-x-3">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-tight">
                {meta.title}
              </h2>
              <span className="text-sm font-mono text-indigo-400">({qidDisplay})</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Article scientifique publié dans <em>La Tunisie Médicale</em>
            </p>
          </div>

          {/* Multilingual Labels and Descriptions */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border border-slate-800 rounded-lg">
              <thead className="bg-slate-950/70 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Langue</th>
                  <th className="px-3 py-2 text-left font-semibold">Libellé</th>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <tr>
                  <td className="px-3 py-2 font-mono text-indigo-300">fr</td>
                  <td className="px-3 py-2 font-medium text-slate-100">{meta.title}</td>
                  <td className="px-3 py-2 text-slate-400">Article scientifique de La Tunisie Médicale</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-indigo-300">ar</td>
                  <td className="px-3 py-2 font-medium text-slate-100">{meta.titleArabic || meta.title}</td>
                  <td className="px-3 py-2 text-slate-400">مقال علمي في المجلة الطبية التونسية</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-indigo-300">en</td>
                  <td className="px-3 py-2 font-medium text-slate-100">{meta.title}</td>
                  <td className="px-3 py-2 text-slate-400">A scholarly publication in La Tunisie Médicale</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Statements / Claims Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <span>Déclarations (Statements)</span>
            </h3>

            <div className="space-y-3">
              {/* P31: instance of */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold text-indigo-300 flex items-center space-x-1">
                    <span>nature de l'élément (P31)</span>
                  </div>
                  <div className="text-sm font-medium text-white mt-1">
                    article scientifique{' '}
                    <span className="text-xs font-mono text-slate-400">(Q13442814)</span>
                  </div>
                </div>
              </div>

              {/* P1476: title */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold text-indigo-300">titre (P1476)</div>
                  <div className="text-sm font-medium text-white mt-1 flex items-center space-x-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      {meta.language}
                    </span>
                    <span>{meta.title}</span>
                  </div>
                </div>
              </div>

              {/* P1433: published in */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold text-indigo-300">publié dans (P1433)</div>
                  <div className="text-sm font-medium text-white mt-1">
                    La Tunisie Médicale{' '}
                    <span className="text-xs font-mono text-slate-400">(Q3213360)</span>
                  </div>
                </div>
              </div>

              {/* P577: publication date */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold text-indigo-300">date de publication (P577)</div>
                  <div className="text-sm font-medium text-white mt-1 font-mono">
                    {meta.publicationDate}
                  </div>
                </div>
              </div>

              {/* P478 & P433 & P304 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-xs font-semibold text-indigo-300">volume (P478)</div>
                  <div className="text-sm font-medium text-white mt-1">{meta.volume}</div>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-xs font-semibold text-indigo-300">numéro (P433)</div>
                  <div className="text-sm font-medium text-white mt-1">{meta.issue}</div>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-xs font-semibold text-indigo-300">page(s) (P304)</div>
                  <div className="text-sm font-medium text-white mt-1">{meta.pageRange}</div>
                </div>
              </div>

              {/* P407: language */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="text-xs font-semibold text-indigo-300">langue de l'œuvre (P407)</div>
                <div className="text-sm font-medium text-white mt-1">
                  {meta.language === 'ar' ? 'arabe (Q13955)' : 'français (Q150)'}
                </div>
              </div>

              {/* Authors: P50 or P2093 */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs font-semibold text-indigo-300">auteur (P50 ou P2093)</div>
                <div className="space-y-1">
                  {meta.authors.map((a, i) => (
                    <div key={a.id} className="text-sm text-slate-100 flex items-center space-x-2">
                      <span className="text-xs text-slate-400 font-mono">#{i + 1}</span>
                      <span className="font-medium">{a.name}</span>
                      {a.wikidataId ? (
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                          {a.wikidataId} (P50)
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                          chaîne (P2093)
                        </span>
                      )}
                      {a.affiliation && (
                        <span className="text-xs text-slate-400 italic">({a.affiliation})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* P921: subjects */}
              {meta.subjects.length > 0 && (
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                  <div className="text-xs font-semibold text-indigo-300">sujet principal (P921)</div>
                  <div className="flex flex-wrap gap-2">
                    {meta.subjects.map((s) => (
                      <span
                        key={s.id}
                        className="px-2 py-1 rounded bg-slate-800 text-xs font-medium text-slate-200 border border-slate-700 flex items-center space-x-1"
                      >
                        <span>{s.name}</span>
                        <span className="font-mono text-indigo-400 text-[10px]">({s.wikidataId})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* P953: full work URL */}
              {meta.fullWorkUrl && (
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-xs font-semibold text-indigo-300">texte intégral disponible à l'URL (P953)</div>
                  <div className="text-xs text-sky-400 mt-1 truncate">
                    <a href={meta.fullWorkUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {meta.fullWorkUrl}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
