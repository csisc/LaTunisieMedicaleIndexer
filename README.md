# La Tunisie Médicale — outil d'indexation Wikidata

Application **100 % statique** : elle tourne sur GitHub Pages, sans serveur ni service tiers (pas de CDN, pas de clé d'API).

- **OCR Tesseract dans le navigateur** : le moteur (worker + wasm) et le modèle français sont servis par le site lui-même (`/ocr/`).
- **Extraction des métadonnées** : analyseur à règles (`src/utils/offlineParser.ts`), formule de la page de fin du projet, rapprochement Wikidata en direct (auteurs, sujets), export QuickStatements.
- **File de travail** : `backend/data/articles.csv`, publié avec le site. Recherche, filtres et navigation fonctionnent sans serveur.
- **Synchronisation Wikidata** : bouton *Synchroniser* (requête directe du navigateur à Wikidata) + action GitHub planifiée toutes les 6 h qui met à jour le CSV du dépôt.

## Déploiement sur GitHub Pages

1. *Settings → Pages → Source : GitHub Actions*.
2. *Settings → Actions → General → Workflow permissions : Read and write permissions* (les actions commitent le CSV et les textes OCR).
3. Poussez sur `main` : `pages.yml` construit le site, **vérifie** qu'il contient tout ce dont l'application a besoin (`npm run verify-dist` : moteur OCR, modèle français, file d'attente, base `/<dépôt>/`) puis le publie.
4. Le même push lance `ocr-batch.yml` : sur les serveurs de GitHub (aucune restriction CORS), il lit la liste des scans de chaque volume, fait l'OCR de chaque page de la file et commite `public/ocr-text/<volume>/<page>.txt`, puis redéploie le site. Il se relance seul jusqu'à couvrir toute la file (et chaque nuit).
5. `sync-csv.yml` retire toutes les 6 h du CSV les pages déjà sur Wikidata.

**Résultat côté navigateur** : pour toute page de la file, l'application charge le texte OCR publié avec le site, sans aucun accès aux Archives (donc sans CORS, sans proxy). L'image du scan s'affiche par une simple balise `<img>`. Une page hors file (URL collée à la main) suit la chaîne « routes d'accès » décrite plus bas.

Si l'action ne peut pas joindre les Archives depuis les serveurs de GitHub, le journal de *OCR batch* le dit (`[index] … HTTP …`) ; dans ce cas, utilisez un proxy (voir plus bas) ou lancez `npm run ocr-batch` depuis une machine qui y accède puis commitez `public/ocr-text/`.

## Comment ça marche sans serveur

| Besoin | Solution |
|---|---|
| Trouver l'image d'une page | **lue à la demande** sur la page « Lecteur des archives » du volume (liste des scans), puis mise en cache dans le navigateur. `public/archive-index.json` n'est plus qu'un cache optionnel. |
| Télécharger le scan | `src/lib/archiveFetch.ts` essaie, dans l'ordre : route même origine (`npm run dev`/`preview`), accès direct, **proxy personnel**, proxys publics. La route qui a fonctionné est mémorisée. |
| OCR | **d'abord le texte pré-calculé par l'action « OCR batch »** (publié avec le site) ; sinon `tesseract.js` dans le navigateur (chargé à la demande), assets locaux (`scripts/prepare-assets.mjs` les copie dans `public/ocr/`). |
| Auteurs / sujets | **recherchés sur Wikidata au moment du traitement** (aucune table de QID dans le code) : un auteur n'est lié que si un seul humain porte exactement ce nom ; les sujets ne sont retenus que si une expression du titre est exactement le libellé d'un élément à description médicale. Le reste est proposé à la main (recherche en direct). |
| Volume / numéro | pris dans `articles.csv` ; à défaut, le volume est déduit des autres lignes de la même année (ou de l'année la plus proche), le numéro reste vide. Rien n'est inventé. |
| File d'attente | `articles.csv` + `created_log.csv` copiés dans le site ; les « Créé · page suivante » sont mémorisés dans le `localStorage` du navigateur |

### Accès aux Archives (CORS)

Les pages et images du site `search.archives.nat.tn` ne sont lisibles depuis un navigateur que si leur serveur envoie des en-têtes CORS ou si une route intermédiaire les ajoute. Si l'accès direct est refusé, l'application essaie les routes suivantes sans rien demander à l'utilisateur ; si **toutes** échouent, elle affiche ce qui a été essayé et permet de régler le proxy.

- **Recommandé : votre propre proxy.** Déployez `worker/cors-proxy.js` sur Cloudflare Workers (limité au seul hôte des Archives), puis construisez le site avec `VITE_ARCHIVE_PROXY="https://<worker>.workers.dev/?url={url}"` (ou saisissez l'adresse dans le panneau « Accès aux Archives »).
- **Proxys publics** (corsproxy.io, allorigins, codetabs) : essayés en dernier, désactivables dans le panneau. Ce sont des services tiers, sans garantie de disponibilité, qui voient l'adresse de la page demandée.
- **En local** (`npm run dev` / `npm run preview`) : Vite relaie `/__archive/…` vers les Archives, aucun CORS n'est nécessaire.
- Dernier recours, uniquement après échec de toutes les routes : importer un scan à la main (bouton discret du panneau, glisser-déposer ou Ctrl+V).

### Page ouverte par défaut et liens directs

L'espace de travail s'ouvre sur `…/La%20Tunisie%20Medicale-1954#page/23/mode/2up`. Un lien `#/before_1956?url=<adresse encodée>` ouvre et traite directement la page indiquée.

## Développement local

```bash
npm install --legacy-peer-deps
npm run ocr-batch       # OCR de la file en local (LIMIT=20 ONLY=1954 pour restreindre)
npm run index-archive   # optionnel : pré-remplit le cache public/archive-index.json (accès aux Archives nationales requis)
npm run dev
npm test                # synchronisation, lecture du lecteur des Archives, routes d'accès, analyseur, Wikidata (simulé)
```
