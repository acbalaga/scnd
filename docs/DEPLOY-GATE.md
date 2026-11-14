# Deploy gate

Added 14 Nov 2026 (ticket #41). Every push to `main` deploys to https://myscnd.app through Cloudflare's Git integration (Workers Builds). Before this, nothing ran the tests first.

There are two checks. Both run `node --test` (no dependencies, no secrets).

## 1. GitHub Actions (in the repo, already on)

`.github/workflows/test.yml` runs the tests on every push to any branch and on every pull request. A red check on a pull request means: do not merge.

It does not stop a deploy by itself, because Cloudflare deploys from `main` on its own. That is what step 2 is for.

## 2. Cloudflare build command (Fred, by hand)

Workers Builds runs a build command, then the deploy command. If the build command fails, the deploy does not run (Cloudflare docs, Workers Builds configuration, read 14 Nov 2026).

1. Cloudflare dashboard > Workers & Pages > `scnd` > Settings > Build.
2. Build command: `node --test`
3. Leave the deploy command as it is (`npx wrangler deploy`).
4. Save. Then push any small commit to `main` and open the build log: it should list the test run (`# pass ...`, `# fail 0`) before the deploy step.

If the build image's Node version cannot run the tests (an error before any test runs, not a failing test), set the `NODE_VERSION` build variable to `22` on the same page.

Menu names were taken from Cloudflare's docs, not from the dashboard. If they differ, the setting is the "Build command" field of the Worker's Git build configuration.

## 3. Branch protection (Fred, optional)

GitHub > `acbalaga/scnd` > Settings > Branches (or Rules) > add a rule for `main`: require the `node-test` status check to pass before merging. GitHub may not offer this on a private repository on the free plan. Step 2 is the gate that matters either way.

## What the tests also guard

- `test/vendor.test.mjs`: the vendored Alpine file is byte-identical to the npm release named in its header. Changing it is a dependency change (ask Fred).
- `test/headers.test.mjs`: every header and the CSP (no `'unsafe-eval'`), the theme-script hash on every page, and that no Worker script comes back.
- `test/sw.test.mjs`: the offline service worker's version matches its files.
- `test/html.test.mjs`: template expressions stay within what Alpine's CSP build can run.
