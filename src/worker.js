// SCND Worker. Serves public/ and rate-limits requests per visitor. Nothing else.
//
// wrangler.jsonc sets assets.run_worker_first so this script sees every request, including static files.
// The limiter is Cloudflare's Workers Rate Limiting binding (LIMITER): a counter per key, held by Cloudflare.
// The key is a daily-rotating SHA-256 hash of the visitor IP, so the raw IP is never our key and counters
// reset on their own. We do not log, store or forward anything, and we never read user inputs.
// It fails open: if the binding is missing or errors, the visitor is served. The limiter must never take
// the site down.

const BLOCKED = 'Too many requests. Please wait a few seconds and try again.';

async function visitorKey(ip, now = new Date()) {
  const data = new TextEncoder().encode(`${ip}|${now.toISOString().slice(0, 10)}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const ip = request.headers.get('cf-connecting-ip');   // set by Cloudflare at the edge
    if (ip && env.LIMITER) {
      try {
        const { success } = await env.LIMITER.limit({ key: await visitorKey(ip) });
        if (!success) {
          return new Response(BLOCKED, {
            status: 429,
            headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '10', 'cache-control': 'no-store' },
          });
        }
      } catch {
        // fail open
      }
    }
    return env.ASSETS.fetch(request);
  },
};
