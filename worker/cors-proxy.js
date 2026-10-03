/**
 * Minimal CORS proxy restricted to search.archives.nat.tn — deploy it on your own Cloudflare account
 * (Workers & Pages → Create → paste this file), then give the app its address:
 *
 *   • at build time:   VITE_ARCHIVE_PROXY="https://<your-worker>.workers.dev/?url={url}"
 *   • or in the app:   "Accès aux Archives" panel → "Proxy personnel"
 *
 * It only forwards GET requests for pages and images of the archive, and adds the CORS header the archive lacks.
 */
const ALLOWED_HOST = 'search.archives.nat.tn';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    let u;
    try {
      u = new URL(target);
    } catch {
      return new Response('missing or invalid ?url=', { status: 400, headers: cors });
    }
    if (u.protocol !== 'https:' || u.hostname !== ALLOWED_HOST) {
      return new Response('host not allowed', { status: 403, headers: cors });
    }

    const upstream = await fetch(u.toString(), {
      headers: { Referer: `https://${ALLOWED_HOST}/`, 'User-Agent': 'Mozilla/5.0 (compatible; LaTunisieMedicaleIndexer)' },
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    headers.delete('set-cookie');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
