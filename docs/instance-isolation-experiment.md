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
asset caching are unchanged. The application does not change external CDN or
reverse-proxy configuration; confirm the production edge honors no-store and
query strings before relying on the deployed experiment.

## Production checks

1. Inspect the document response for the four headers above. Compare the same
   URL without the flag, an API request, and a JS asset. Those must not acquire
   isolation headers. Revisit the ordinary document after the experimental one.
2. Check secure context, window isolation, SAB availability, worker isolation,
   and the observed 41 to 42 mutation. The probe uses only four shared bytes.
   Its blob module worker inherits the document policy; no worker asset headers
   or existing event-processing workers are changed.
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
loopback HTTP server. It verifies actual dedicated module-worker sharing under
COOP/COEP and a non-isolated normal document. It does not exercise production
third-party integrations.
