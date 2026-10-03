import React, { useState } from 'react';
import { RotateCw, Settings2, Upload } from 'lucide-react';
import { Attempt, getOwnProxy, publicProxiesEnabled, setOwnProxy, setPublicProxiesEnabled } from '../lib/archiveFetch';

interface Props {
  attempts: Attempt[];
  imageUrl?: string;
  onRetry: () => void;
  onManualFile: () => void;
}

/** Shown only when every automatic route to the archive failed: says what was tried and lets the user fix the access. */
export const ArchiveAccessPanel: React.FC<Props> = ({ attempts, imageUrl, onRetry, onManualFile }) => {
  const [proxy, setProxy] = useState(getOwnProxy());
  const [pub, setPub] = useState(publicProxiesEnabled());

  const apply = () => {
    setOwnProxy(proxy);
    setPublicProxiesEnabled(pub);
    onRetry();
  };

  return (
    <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 space-y-3">
      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
        <Settings2 className="w-4 h-4 text-indigo-400" />
        Accès aux Archives nationales
      </div>

      <ul className="space-y-0.5 font-mono text-[11px]">
        {attempts.map((a, i) => (
          <li key={i} className={a.ok ? 'text-emerald-400' : 'text-slate-400'}>
            {a.ok ? '✓' : '✗'} {a.route} — {a.detail}
          </li>
        ))}
      </ul>

      <label className="block space-y-1">
        <span className="text-slate-400">
          Proxy personnel (modèle d'URL, <code className="text-amber-300">{'{url}'}</code> = adresse encodée) — voir <code>worker/cors-proxy.js</code>
        </span>
        <input
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          placeholder="https://mon-proxy.workers.dev/?url={url}"
          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg font-mono text-slate-100"
        />
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} />
        <span>Essayer aussi des proxys publics (services tiers : l'adresse de la page leur est transmise)</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={apply}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" /> Enregistrer et réessayer
        </button>
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline text-sky-300 hover:text-sky-200">
            Ouvrir le scan
          </a>
        )}
        <button type="button" onClick={onManualFile} className="ml-auto text-slate-500 hover:text-slate-300 flex items-center gap-1 cursor-pointer">
          <Upload className="w-3 h-3" /> dernier recours : importer un scan à la main
        </button>
      </div>
    </div>
  );
};
