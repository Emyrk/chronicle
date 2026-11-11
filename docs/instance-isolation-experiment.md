# Instance isolation compatibility experiment

Open an existing production instance URL with `?isolationTest=1` (or append
`&isolationTest=1` to existing query state), using a full document navigation.
This is an unlisted diagnostic, not a private page or an access-control flag.
It does not share event streams or change aggregation.

Only GET/HEAD HTML responses for the exact `/instances/<id-or-slug>` path opt in.
Trailing slashes, nested paths, assets, APIs, other pages, other values, and
repeated flags do not opt in. Experimental HTML gets:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cache-Control: no-store`
- `X-Robots-Tag: noindex, nofollow` and the matching HTML robots state

The frontend captures the flag before its SPA fallback rewrites the request
path. Headers are applied only after successful HTML rendering. This rendering
path does not use the static file ETag/cache middleware. Normal HTML and static
asset caching are unchanged. Aggregation worker assets additionally receive COEP as described below.
The application does not change external CDN or
reverse-proxy configuration; confirm the production edge honors no-store and
query strings before relying on the deployed experiment.

## Production checks

1. Inspect the document response for the four headers above. Compare the same
   URL without the flag, an API request, and a JS asset. Those must not acquire
   isolation headers. Revisit the ordinary document after the experimental one.
2. Check secure context, window isolation, SAB availability, worker isolation,
   and the observed 41 to 42 mutation. The probe uses only four shared bytes.
   Its blob module worker inherits the document policy; it does not validate
   HTTP worker response headers. The real panel workers must also load.
3. Exercise real eligible ads and consent, YouTube playback/sync, images/models,
   replay, and popouts. Inspect console/network failures. Existing eligibility
   rules still apply, so ad-free viewers/uploads may not show ads.
4. COEP can block external resources; COOP can sever opener relationships. The
   diagnostic does not bypass those policies or hide broken integrations.
   A successful SAB probe proves only the small worker handshake.
5. Use **Exit experiment (full reload)** before ordinary browsing. Isolation is
   a document policy: adding/removing the flag with SPA navigation alone cannot
   change it. The reload button also handles entering via SPA navigation.

## Local checks

- `go test ./frontend`
- `pnpm -C frontend/chronicle exec vitest run --project unit src/pages/Instance/isolationProbe.test.ts`
- `pnpm -C frontend/chronicle exec node scripts/test-isolation-worker.mjs`
- `pnpm -C frontend/chronicle exec tsc -b`
- `pnpm -C frontend/chronicle build`

The browser smoke test uses installed Playwright Chromium with a temporary
loopback HTTP server. Build first: the test serves the actual production
aggregation worker bundle. It verifies blob-worker SAB sharing, HTTP module-worker
isolation, and a successful empty-stream damage aggregation request from both
normal and isolated documents. Serving the same bundle without COEP reproduces
the isolated-document block. It does not exercise production third-party integrations.

## Aggregation worker response policy and caching

`/assets/aggregationPanelWorker-<hash>.js` responses always receive
`Cross-Origin-Embedder-Policy: require-corp`, including revalidation responses.
No query flag is necessary for this worker response. A normal document remains
non-isolated and can run this worker; an isolated document requires the worker's
own compatible COEP response. COOP remains document-only and opt-in.

The aggregation worker is bundled computation over bytes posted by the main
thread, with no fetch, dynamic imports, importScripts, XHR, WebSocket, or external
URLs in the verified production bundle. Revisit this policy if worker networking
is added. The separate Guides Lua `panelWorker-<hash>.js` is deliberately excluded.

The entry was renamed from `panelWorker.ts` to `aggregationPanelWorker.ts` both to
scope the policy accurately and to change its asset pathname. Existing worker
responses can be cached for one day without COEP; a header-only server patch
cannot repair fresh browser/CDN cache entries. The new pathname bypasses those
entries without a query-dependent worker mode. Deploy the rebuilt frontend and
backend together, then fully reload the document to obtain the new worker URL.
Already-open pages may keep using the old entry until reloaded. New worker assets
retain the normal one-day static caching policy; experimental HTML stays no-store.

At the production edge, verify that the new aggregation worker URL returns COEP,
then check a normal page and an opted-in page. If a proxy ignores or overrides
origin policy, correct/purge that edge cache; application tests cannot verify it.
