# La Tunisie Médicale — outil d'indexation Wikidata

Application **100 % statique** : elle tourne sur GitHub Pages, sans serveur ni service tiers (pas de CDN, pas de clé d'API).

- **OCR Tesseract dans le navigateur** : le moteur (worker + wasm) et le modèle français sont servis par le site lui-même (`/ocr/`).
- **Extraction des métadonnées** : analyseur à règles (`src/utils/offlineParser.ts`), formule de la page de fin du projet, export QuickStatements.
- **File de travail** : `backend/data/articles.csv`, publié avec le site. Recherche, filtres et navigation fonctionnent sans serveur.
- **Synchronisation Wikidata** : bouton *Synchroniser* (requête directe du navigateur à Wikidata) + action GitHub planifiée toutes les 6 h qui met à jour le CSV du dépôt.

## Déploiement

1. *Settings → Pages → Source : GitHub Actions*.
2. Poussez sur `main` : `.github/workflows/pages.yml` construit et publie le site.
3. L'action `sync-csv.yml` retire du CSV les pages déjà sur Wikidata, commite, puis redéclenche le déploiement.

## Comment ça marche sans serveur

| Besoin | Solution statique |
|---|---|
| OCR | `tesseract.js` dans le navigateur, assets locaux (`scripts/prepare-assets.mjs` les copie dans `public/ocr/`) |
| Trouver l'image d'une page | `public/archive-index.json` (volume → liste des images), généré par `scripts/build-archive-index.mjs` pendant le build |
| File d'attente | `articles.csv` + `created_log.csv` copiés dans le site ; les « Créé · page suivante » sont mémorisés dans le `localStorage` du navigateur |
| Recherche d'auteurs / sujets | API Wikidata appelée directement (`origin=*`) |

### Limite à connaître

Le navigateur peut afficher le scan des Archives nationales, mais ne peut le **lire** pour l'OCR que si leur serveur envoie des en-têtes CORS. Si ce n'est pas le cas, l'application le dit et propose l'import du scan : bouton *Scan image*, glisser-déposer ou collage (Ctrl+V) ; l'OCR et le reste fonctionnent alors à l'identique.

## Développement local

```bash
npm install --legacy-peer-deps
npm run index-archive   # optionnel : remplit public/archive-index.json (nécessite l'accès aux Archives nationales)
npm run dev
npm test                # tests de la synchronisation
```
