// Usage: npm run sync   (e.g. from cron). Exits non-zero if Wikidata could not be queried.
import { syncWithWikidata } from '../wikidataSync.ts';

const r = await syncWithWikidata();
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);
