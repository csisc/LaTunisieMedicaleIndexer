// Pre-fills public/archive-index.json (a cache: the browser reads missing volumes itself). Never fails the build.
import { queuePages, readIndex, writeIndex, ensureVolume, norm } from './archive-node.ts';

const index = readIndex();
const volumes = [...new Map(queuePages().map((p) => [norm(p.vol), p.vol])).values()].sort();
let added = 0;
let failed = 0;
for (const v of volumes) {
  if (index[norm(v)]?.files?.length) continue;
  (await ensureVolume(index, v)) ? added++ : failed++;
}
writeIndex(index);
console.log(`[index] ${Object.keys(index).length} volumes (${added} added, ${failed} failed)`);
