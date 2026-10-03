import React from 'react';
import { X, BookOpen, ExternalLink, ShieldCheck, CheckCircle2, FileCode, Database } from 'lucide-react';

interface ProjectGuidelinesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectGuidelinesModal: React.FC<ProjectGuidelinesModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-950 text-red-300 border border-red-800">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100">
                Guide du Projet &amp; Propriétés Wikidata
              </h2>
              <p className="text-xs text-slate-400">
                Wikidata Arabic Community · Indexation de La Tunisie Médicale
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300 leading-relaxed">
          {/* Overview */}
          <div className="p-4 bg-slate-800/60 border border-slate-700/80 rounded-xl space-y-2">
            <h3 className="font-bold text-sm text-slate-100 flex items-center space-x-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>À propos de l'initiative</span>
            </h3>
            <p>
              Cette initiative de la <strong>Communauté Wikidata Arabe (Wikidata Arabic Community)</strong> a pour mission de répertorier et d'indexer l'ensemble des articles historiques publiés dans <em>La Tunisie Médicale</em> (fondée en 1903), en particulier les <strong>éditions antérieures à 1956</strong> conservées dans les Archives Nationales de Tunisie (ANT).
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href="https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation/Before_1956"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-sky-400 hover:underline font-medium"
              >
                <span>Page du projet : Avant 1956</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-slate-500">•</span>
              <a
                href="https://www.wikidata.org/wiki/Wikidata:Wikidata_Arabic_Community/La_Tunisie_Medicale_indexation"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-sky-400 hover:underline font-medium"
              >
                <span>Page principale de l'indexation</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Model Table */}
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-slate-100">
              Modèle de données Wikidata (Propriétés requises)
            </h3>
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="min-w-full text-left divide-y divide-slate-800 text-xs">
                <thead className="bg-slate-950 text-slate-400 font-semibold">
                  <tr>
                    <th className="px-3 py-2">Propriété</th>
                    <th className="px-3 py-2">Libellé</th>
                    <th className="px-3 py-2">Valeur attendue</th>
                    <th className="px-3 py-2">Exemple</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P31</td>
                    <td className="px-3 py-2">nature de l'élément</td>
                    <td className="px-3 py-2">article scientifique (Q13442814)</td>
                    <td className="px-3 py-2 font-mono">Q13442814</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P1476</td>
                    <td className="px-3 py-2">titre de l'article</td>
                    <td className="px-3 py-2">Texte monolingue (fr, ar ou en)</td>
                    <td className="px-3 py-2 font-mono">fr:"Le trachome..."</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P50 / P2093</td>
                    <td className="px-3 py-2">auteur</td>
                    <td className="px-3 py-2">Élément Wikidata (P50) ou chaîne (P2093)</td>
                    <td className="px-3 py-2 font-mono">Q2829286 (Ahmed Ben Miled)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P1433</td>
                    <td className="px-3 py-2">publié dans</td>
                    <td className="px-3 py-2">La Tunisie Médicale</td>
                    <td className="px-3 py-2 font-mono">Q3213360</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P577</td>
                    <td className="px-3 py-2">date de publication</td>
                    <td className="px-3 py-2">Date au format +YYYY-MM-00T00:00:00Z/10</td>
                    <td className="px-3 py-2 font-mono">+1954-04-00T00:00:00Z/10</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P478</td>
                    <td className="px-3 py-2">volume</td>
                    <td className="px-3 py-2">Chaîne (numéro en chiffres)</td>
                    <td className="px-3 py-2 font-mono">"32"</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P433</td>
                    <td className="px-3 py-2">numéro</td>
                    <td className="px-3 py-2">Chaîne (fascicule)</td>
                    <td className="px-3 py-2 font-mono">"4"</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P304</td>
                    <td className="px-3 py-2">page(s)</td>
                    <td className="px-3 py-2">Plage de pages</td>
                    <td className="px-3 py-2 font-mono">"9-14"</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P407</td>
                    <td className="px-3 py-2">langue de l'œuvre</td>
                    <td className="px-3 py-2">Français (Q150) ou Arabe (Q13955)</td>
                    <td className="px-3 py-2 font-mono">Q150</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P921</td>
                    <td className="px-3 py-2">sujet principal</td>
                    <td className="px-3 py-2">Élément de la maladie ou spécialité</td>
                    <td className="px-3 py-2 font-mono">Q12156 (Paludisme)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-indigo-300">P953</td>
                    <td className="px-3 py-2">texte intégral à l'URL</td>
                    <td className="px-3 py-2">Lien vers le lecteur des archives ANT</td>
                    <td className="px-3 py-2 font-mono">"https://search.archives.nat.tn/..."</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Workflow */}
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-slate-100 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Processus de contribution en 4 étapes</span>
            </h3>
            <ol className="list-decimal pl-4 space-y-1.5 text-slate-300">
              <li>
                <strong>Sélectionner un article non indexé</strong> dans la liste (filtre « Avant 1956 » ou année spécifique).
              </li>
              <li>
                <strong>Ouvrir la première page numérisée</strong> et lancer la reconnaissance OCR ou le parseur sémantique.
              </li>
              <li>
                <strong>Contrôle et vérification humaine</strong> : valider chaque champ (titre, auteurs avec réconciliation Wikidata, volume, numéro, dates, pages) dans l'espace de vérification côte à côte.
              </li>
              <li>
                <strong>Export QuickStatements</strong> : générer les commandes V2 et les soumettre en 1 clic dans l'outil Toolforge de Wikimedia pour créer l'élément Wikidata !
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
