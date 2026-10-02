// Security header values for the Worker, kept out of src/worker.js on purpose: workerd treats every named export of
// the main module as an entrypoint and refuses to start when one is not a handler, so constants cannot live there.

// sha256 of the inline theme script in public/index.html. test/worker.test.mjs fails if the two drift apart.
export const THEME_SCRIPT_HASH = 'sha256-B8U7Anw7zuz9OFoSuoKagKsf+/k9rF62FJxi1G4tCEw=';

// Alpine's standard build compiles x-data expressions with new Function, so script-src needs 'unsafe-eval'.
// Cloudflare Web Analytics (cookieless page-view counts, turned on in the Cloudflare dashboard, not in this repo) injects
// a beacon script from static.cloudflareinsights.com and reports to cloudflareinsights.com. Allowed here and disclosed in
// "Privacy and limits" (Fred, 2 Oct 2026; pre-launch audit M-10). Turning Web Analytics off makes both entries unused.
// style-src needs 'unsafe-inline' for the style="" attributes in index.html. Everything else is locked to self.
export const CSP = [
  "default-src 'self'",
  `script-src 'self' '${THEME_SCRIPT_HASH}' 'unsafe-eval' https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://satellite-api.open-meteo.com https://power.larc.nasa.gov https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
