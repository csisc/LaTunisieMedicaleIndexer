<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bb738cd8-c7f4-4262-a21e-bee8089964f1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Work queue (CSV) and Wikidata sync

The two Meta-Wiki tables (Main page 1956–2008, Before 1956) are replaced by one CSV:
`backend/data/articles.csv` (`source,year,volume,issue,page,rank,url,notes`, 2 130 pending rows; a URL can appear several times because several articles can start on the same page).
The original parsed pages are kept in `backend/data/seed/`; `backend/scripts/build-csv.py` rebuilds the CSV from them.

- **Landing page** (`#/before_1956`, `#/main_page`): choose the list to process; each card shows the pages still to do.
- **Automatic clean-up**: `backend/wikidataSync.ts` queries Wikidata (items with *published in* = La Tunisie Médicale
  and a *full work URL* pointing to `search.archives.nat.tn`), matches them to CSV rows by volume + page
  (immune to http/https, `%20`, `/mode/2up`), removes those rows (one row per Wikidata item, so a page with 2 articles and 1 item keeps 1 row; QIDs already logged are never counted twice) and appends them to `backend/data/created_log.csv`.
  It runs at server start, then every `SYNC_INTERVAL_HOURS` (default 6; 0 disables), via the *Synchroniser* button
  (`POST /api/sync`) or `npm run sync` (cron). If Wikidata cannot be reached the CSV is left untouched.
- **Shortcut**: after creating an item, "Créé · page suivante" removes the page immediately (`POST /api/articles/mark-created`).
- Tests: `npm test`.
