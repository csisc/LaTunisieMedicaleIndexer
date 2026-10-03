import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CollectionId, QueueItem, getQueue } from '../api';

interface CollectionQueueProps {
  collection: CollectionId;
  refreshKey: number; // bump to reload after a page leaves the queue
  activeUrl?: string;
  onPick: (item: QueueItem) => void;
}

const PAGE = 30;

export const CollectionQueue: React.FC<CollectionQueueProps> = ({ collection, refreshKey, activeUrl, onPick }) => {
  const [q, setQ] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; years: number[]; items: QueueItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setOffset(0), [q, year, collection]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      getQueue({ collection, q, year: year || undefined, offset, limit: PAGE })
        .then((d) => !cancelled && (setData(d), setError(null)))
        .catch((e) => !cancelled && setError(e.message));
    }, q ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [collection, q, year, offset, refreshKey]);

  return (
    <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-300">
          {data ? `${data.total.toLocaleString('fr-FR')} page(s) à traiter` : 'Chargement…'}
        </span>
        <div className="flex gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value ? parseInt(e.target.value, 10) : '')}
            className="px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200"
            aria-label="Filtrer par année"
          >
            <option value="">Toutes les années</option>
            {data?.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Page, volume, note…"
            className="px-3 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 w-44"
          />
        </div>
      </div>

      {error && <div className="text-xs text-rose-300">{error}</div>}

      <div className="max-h-64 overflow-y-auto pr-1 divide-y divide-slate-800/50">
        {!data && <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto my-4" />}
        {data?.items.map((item, i) => (
          <div
            key={`${item.url}-${offset + i}`}
            onClick={() => onPick(item)}
            className={`py-1.5 flex items-center justify-between gap-2 hover:bg-slate-800/50 px-2 rounded-lg cursor-pointer transition-colors text-xs ${
              item.url === activeUrl ? 'bg-indigo-950/50' : ''
            }`}
          >
            <div className="flex items-center space-x-3 truncate">
              <span className="font-semibold text-amber-300 w-10">{item.year}</span>
              <span className="text-slate-200 w-14">p. {item.page}</span>
              <span className="text-slate-400 truncate">
                {item.volume ? `vol. ${item.volume}` : ''}
                {item.issue ? ` n° ${item.issue}` : ''}
                {item.notes ? ` · ${item.notes}` : ''}
              </span>
              {(item.articlesOnPage ?? 1) > 1 && (
                <span className="text-[10px] text-sky-300 bg-sky-950/60 border border-sky-900/60 rounded px-1.5 shrink-0">
                  {item.articlesOnPage} articles sur cette page
                </span>
              )}
            </div>
            <span className="text-[11px] text-indigo-400 shrink-0">Traiter &rarr;</span>
          </div>
        ))}
        {data && data.items.length === 0 && <div className="text-xs text-slate-500 py-3 text-center">Aucune page.</div>}
      </div>

      {data && data.total > PAGE && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            className="px-2 py-1 rounded bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            ← Précédentes
          </button>
          <span>
            {offset + 1}–{Math.min(offset + PAGE, data.total)} / {data.total}
          </span>
          <button
            disabled={offset + PAGE >= data.total}
            onClick={() => setOffset(offset + PAGE)}
            className="px-2 py-1 rounded bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            Suivantes →
          </button>
        </div>
      )}
    </div>
  );
};
