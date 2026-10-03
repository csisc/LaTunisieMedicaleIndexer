/**
 * Live Wikidata lookups (the API allows cross-origin calls with origin=*). Replaces the old hardcoded tables of
 * authors and medical subjects: nothing is assumed, everything is searched when needed.
 */
import { AuthorRef, SubjectRef } from '../types/article';

export type Fetcher = (url: string) => Promise<Response>;

const API = 'https://www.wikidata.org/w/api.php';

export interface Entity {
  id: string;
  label: string;
  description?: string;
  /** What matched the query: the label or an alias. */
  matchType?: string;
  matchText?: string;
}

/** Lowercase, no accents, no punctuation, single spaces: for comparing names regardless of OCR/typographic noise. */
export const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const qs = (o: Record<string, string>) => new URLSearchParams({ format: 'json', origin: '*', ...o }).toString();

async function getJson(url: string, f: Fetcher): Promise<any> {
  const r = await f(url);
  if (!r.ok) throw new Error(`Wikidata HTTP ${r.status}`);
  return r.json();
}

export async function searchEntities(query: string, lang = 'fr', limit = 8, f: Fetcher = fetch as Fetcher): Promise<Entity[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = await getJson(
    `${API}?${qs({ action: 'wbsearchentities', search: q, language: lang, uselang: lang, type: 'item', limit: String(limit) })}`,
    f,
  );
  return (data.search || []).map((it: any) => ({
    id: it.id,
    label: it.label ?? it.id,
    description: it.description,
    matchType: it.match?.type,
    matchText: it.match?.text,
  }));
}

/** Items that are instances of "human" and match a name (CirrusSearch), with their labels, aliases and descriptions. */
export async function searchPeople(name: string, lang = 'fr', f: Fetcher = fetch as Fetcher): Promise<(Entity & { names: string[] })[]> {
  const q = name.trim();
  if (q.length < 3) return [];
  const found = await getJson(
    `${API}?${qs({ action: 'query', list: 'search', srsearch: `haswbstatement:P31=Q5 "${q.replace(/"/g, ' ')}"`, srlimit: '8', srnamespace: '0' })}`,
    f,
  );
  const ids: string[] = (found?.query?.search || []).map((h: any) => h.title).filter((t: string) => /^Q\d+$/.test(t));
  if (!ids.length) return [];
  const ents = await getJson(
    `${API}?${qs({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|aliases|descriptions', languages: `${lang}|en|ar|fr` })}`,
    f,
  );
  return ids
    .map((id) => ents?.entities?.[id])
    .filter(Boolean)
    .map((e: any) => {
      const labels = Object.values(e.labels || {}).map((l: any) => l.value as string);
      const aliases = Object.values(e.aliases || {}).flatMap((a: any) => a.map((x: any) => x.value as string));
      const desc = (e.descriptions?.[lang] || e.descriptions?.en || Object.values(e.descriptions || {})[0]) as any;
      return { id: e.id as string, label: (e.labels?.[lang]?.value || labels[0] || e.id) as string, description: desc?.value as string | undefined, names: [...labels, ...aliases] };
    });
}

/**
 * Finds the Wikidata person for an author name. Only returns a QID when the match is unambiguous: exactly one
 * human whose label or alias equals the name (ignoring case, accents, punctuation, word order). Otherwise the
 * author is left for the user to reconcile (with the candidates available in the reconcile dialog).
 */
export async function autoReconcileAuthor(name: string, f?: Fetcher): Promise<{ id: string; label: string } | null> {
  const wanted = normName(name);
  if (wanted.split(' ').length < 2) return null; // a lone surname is never specific enough
  const sorted = (s: string) => s.split(' ').sort().join(' ');
  const people = await searchPeople(name, 'fr', f);
  const hits = people.filter((p) => p.names.some((n) => normName(n) === wanted || sorted(normName(n)) === sorted(wanted)));
  return hits.length === 1 ? { id: hits[0].id, label: hits[0].label } : null;
}

const FR_STOP = new Set(
  'a au aux avec ce ces cet cette dans de des du d en et l la le les leur leurs lors mais ou par pour sans se ses son sur sa un une que qui quoi quel quelle quels quelles ne pas plus à é est sont ont été étude essai note cas propos'.split(' '),
);

/** A description that makes an item plausible as the subject of a medical article (language-level words, not item IDs). */
export const MEDICAL_DESCRIPTION =
  /maladie|syndrome|infection|affection|pathologie|trouble|médecine|médical|chirurg|anatomi|organe|muscle|os de|artère|veine|nerf|glande|médicament|molécule|substance|vaccin|symptôme|diagnostic|thérap|traitement|spécialité|bactéri|virus|parasite|champignon|cancer|tumeur|disease|syndrome|infection|medical|medicine|surgical|surgery|anatom|organ|drug|symptom|therapy|treatment|bacteri|parasit|medical specialty|مرض|طب|جراحة/i;

/** Word n-grams of a title, longest first, never starting or ending on a stop word. */
export function titleNgrams(title: string, maxN = 4): string[] {
  const words = title
    .replace(/[’']/g, ' ')
    .split(/[^\p{L}\p{N}-]+/u)
    .filter(Boolean);
  const out: string[] = [];
  for (let n = Math.min(maxN, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const g = words.slice(i, i + n);
      const isStop = (w: string) => FR_STOP.has(w.toLowerCase()) || w.length < 3;
      if (isStop(g[0]) || isStop(g[g.length - 1])) continue;
      out.push(g.join(' '));
    }
  }
  return out;
}

/**
 * Subject candidates for an article, found by looking up the phrases of its title on Wikidata.
 * Kept only when the phrase equals the item's label or alias AND the item's description reads as medical.
 */
export async function suggestSubjects(title: string, lang: 'fr' | 'ar' | 'en' = 'fr', f?: Fetcher, max = 5): Promise<SubjectRef[]> {
  const grams = titleNgrams(title).slice(0, 14);
  const results = await Promise.all(
    grams.map(async (g) => {
      try {
        return { g, hits: await searchEntities(g, lang, 4, f) };
      } catch {
        return { g, hits: [] as Entity[] };
      }
    }),
  );
  const subjects: SubjectRef[] = [];
  const covered: string[] = [];
  for (const { g, hits } of results) {
    const ng = normName(g);
    if (covered.some((c) => c.includes(ng))) continue; // already covered by a longer phrase
    const hit = hits.find((h) => normName(h.matchText ?? h.label) === ng && MEDICAL_DESCRIPTION.test(h.description ?? ''));
    if (hit && !subjects.some((s) => s.wikidataId === hit.id)) {
      subjects.push({ id: `subj-${subjects.length + 1}`, name: hit.label, wikidataId: hit.id });
      covered.push(ng);
      if (subjects.length >= max) break;
    }
  }
  return subjects;
}

/** Fills in what can be determined with certainty from Wikidata. Never throws: lookup failures leave the data as parsed. */
export async function enrichFromWikidata(
  m: { authors: AuthorRef[]; subjects: SubjectRef[]; title: string; language: 'fr' | 'ar' | 'en' },
  f?: Fetcher,
): Promise<{ authors: AuthorRef[]; subjects: SubjectRef[] }> {
  const authors = await Promise.all(
    m.authors.slice(0, 6).map(async (a) => {
      if (a.wikidataId || !a.name) return a;
      try {
        const r = await autoReconcileAuthor(a.name, f);
        return r ? { ...a, wikidataId: r.id } : a;
      } catch {
        return a;
      }
    }),
  );
  let subjects = m.subjects;
  if (!subjects.length && m.title) {
    try {
      subjects = await suggestSubjects(m.title, m.language, f);
    } catch {
      /* offline: the user can search subjects by hand */
    }
  }
  return { authors: [...authors, ...m.authors.slice(6)], subjects };
}
