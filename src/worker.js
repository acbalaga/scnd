// SCND Worker. Serves public/ and rate-limits requests per visitor. Nothing else.
//
// wrangler.jsonc sets assets.run_worker_first so this script sees every request, including static files.
// The limiter is Cloudflare's Workers Rate Limiting binding (LIMITER): a counter per key, held by Cloudflare.
// The key is a daily-rotating SHA-256 hash of the visitor IP, so the raw IP is never our key and counters
// reset on their own. We do not log, store or forward anything, and we never read user inputs.
// It fails open: if the binding is missing or errors, the visitor is served. The limiter must never take
// the site down.
// It also adds security headers to every response, so the browser enforces the privacy claim: user inputs
// can only go to this origin, and the only other hosts the page may call are the two irradiance sources.

import { CSP } from './headers.js';

const SECURITY_HEADERS = {
  'content-security-policy': CSP,
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
};

// x-limiter says which path the limiter took: ok, blocked, open-no-ip, open-no-binding or open-error.
// A diagnostic only (added 2 Oct 2026 to find out why production was not blocking); it carries no visitor data.
function secure(response, limiter) {
  const res = new Response(response.body, response);   // headers on a fetched Response are immutable
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  res.headers.set('x-limiter', limiter);
  return res;
}

const BLOCKED = 'Too many requests. Please wait a few seconds and try again.';

async function visitorKey(ip, now = new Date()) {
  const data = new TextEncoder().encode(`${ip}|${now.toISOString().slice(0, 10)}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const ip = request.headers.get('cf-connecting-ip');   // set by Cloudflare at the edge
    let state = !ip ? 'open-no-ip' : !env.LIMITER ? 'open-no-binding' : 'ok';
    if (ip && env.LIMITER) {
      try {
        const { success } = await env.LIMITER.limit({ key: await visitorKey(ip) });
        if (!success) {
          return secure(new Response(BLOCKED, {
            status: 429,
            headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '10', 'cache-control': 'no-store' },
          }), 'blocked');
        }
      } catch {
        state = 'open-error';   // fail open
      }
    }
    return secure(await env.ASSETS.fetch(request), state);
  },
};
