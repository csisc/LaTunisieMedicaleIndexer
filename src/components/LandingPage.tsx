import React, { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, Loader2, RefreshCw, History, BookOpen, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CollectionId, CollectionSummary, SyncResult, getCollections, runSync } from '../api';

interface LandingPageProps {
  onChoose: (id: CollectionId) => void;
  onOpenGuidelines: () => void;
}

const BLURBS: Record<CollectionId, { title: string; text: string; icon: React.ReactNode }> = {
  before_1956: {
    title: 'Avant 1956',
    text: 'Les premiers volumes de la revue (1912 → 1954) : pages de début d’article à indexer à partir des scans des Archives nationales.',
    icon: <History className="w-5 h-5" />,
  },
  main_page: {
    title: 'Page principale',
    text: 'La période moderne (1956 → 2008) : volumes et numéros déjà renseignés, il reste à extraire titres, auteurs et pagination.',
    icon: <BookOpen className="w-5 h-5" />,
  },
};

const ORDER: CollectionId[] = ['before_1956', 'main_page'];

export const LandingPage: React.FC<LandingPageProps> = ({ onChoose, onOpenGuidelines }) => {
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = () =>
    getCollections()
      .then((d) => {
        setCollections(d.collections);
        setLastSync((prev) => d.lastSync ?? prev);
        setError(null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      setLastSync(await runSync());
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const total = collections?.reduce((n, c) => n + c.remaining, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600 via-rose-700 to-indigo-900 flex items-center justify-center text-white font-bold border border-red-400/30">
              TM
            </div>
            <span className="font-bold tracking-tight">La Tunisie Médicale</span>
            <span className="px-2 py-0.5 text-[11px] font-semibold bg-red-950 text-red-300 border border-red-800 rounded">
              Indexation Wikidata
            </span>
          </div>
          <button
            onClick={onOpenGuidelines}
            className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 cursor-pointer"
          >
            Guide du projet
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10">
        <div className="space-y-3 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Quelle liste voulez-vous traiter ?</h1>
          <p className="text-slate-400 leading-relaxed">
            Choisissez une liste de pages à indexer. L’outil récupère le scan, lance l’OCR, propose les métadonnées et prépare
            l’export QuickStatements. Les pages déjà créées sur Wikidata sont retirées automatiquement de la file.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/60 text-sm text-rose-200">{error}</div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {ORDER.map((id) => {
            const c = collections?.find((x) => x.id === id);
            const b = BLURBS[id];
            return (
              <button
                key={id}
                type="button"
                disabled={!c || c.remaining === 0}
                onClick={() => onChoose(id)}
                className="group text-left bg-slate-900 border border-slate-800 hover:border-indigo-500/70 disabled:opacity-60 disabled:hover:border-slate-800 rounded-2xl p-6 transition-colors cursor-pointer disabled:cursor-not-allowed space-y-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <div className="flex items-center justify-between">
                  <span className="w-10 h-10 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-800/60 flex items-center justify-center">
                    {b.icon}
                  </span>
                  {c && c.minYear && (
                    <span className="text-xs font-mono text-amber-300 bg-amber-950/40 border border-amber-900/50 rounded px-2 py-0.5">
                      {c.minYear} – {c.maxYear}
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{b.title}</h2>
                  <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{b.text}</p>
                </div>
                <div className="flex items-end justify-between pt-1">
                  <div>
                    <div className="text-3xl font-bold tabular-nums text-white">
                      {c ? c.remaining.toLocaleString('fr-FR') : <Loader2 className="w-6 h-6 animate-spin text-slate-500" />}
                    </div>
                    <div className="text-xs text-slate-400">pages restantes</div>
                  </div>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-indigo-300 group-hover:text-indigo-200">
                    Traiter <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-slate-100">Synchronisation avec Wikidata</div>
            <p className="text-slate-400 text-xs max-w-xl">
              Interroge Wikidata (articles publiés dans La Tunisie Médicale avec un lien vers les Archives) et supprime du CSV
              les pages qui ont déjà un élément. Exécutée automatiquement au démarrage puis toutes les quelques heures.
            </p>
            {lastSync && (
              <p className={`text-xs flex items-center gap-1.5 ${lastSync.ok ? 'text-emerald-400' : 'text-amber-300'}`}>
                {lastSync.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {lastSync.ok
                  ? `Dernière synchro ${new Date(lastSync.finishedAt).toLocaleString('fr-FR')} : ${lastSync.removed} page(s) retirée(s), ${lastSync.wikidataItems} éléments Wikidata analysés`
                  : `Dernière synchro échouée (${lastSync.error}) — la liste n’a pas été modifiée`}
              </p>
            )}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="shrink-0 px-4 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-60 border border-slate-700 rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </button>
        </section>

        <div className="text-xs text-slate-500 flex flex-wrap gap-x-5 gap-y-1">
          {typeof total === 'number' && <span>{total.toLocaleString('fr-FR')} pages en attente au total</span>}
          {collections?.map((c) => (
            <a key={c.id} href={c.metaWikiUrl} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 inline-flex items-center gap-1">
              Page Meta-Wiki d’origine : {c.label} <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      </main>
    </div>
  );
};
