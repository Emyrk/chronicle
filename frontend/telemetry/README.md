# Chronicle Telemetry Worker

Cloudflare Worker for deployment telemetry and the Access-protected internal dashboards.

## Preview web analytics locally

The analytics dashboard has a bundled aggregate-data preview, so Google credentials are not required for design work.

```sh
cd frontend/telemetry
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The local migration step initializes the existing deployment-telemetry dashboard. The web analytics page itself does not query D1, but its navigation links back to that dashboard.

Open `http://localhost:8787/internal/analytics`. Cloudflare Access is not applied by local Wrangler, and the dashboard displays a **Preview data** badge while `ANALYTICS_MOCK=true`.

The analytics JSON endpoint is:

```text
http://localhost:8787/internal/api/v1/analytics/dashboard?days=30
```

Supported periods are 7, 30, and 90 completed days. Successful responses use `Cache-Control: private, max-age=300`, allowing five minutes of browser-local caching without a shared or database cache.

The preview includes a sanitized aggregate snapshot of the validated September 9–October 8, 2026 GA4 data for product families, server mix, leaderboard modes, and raid categories. The preview never includes player, guild, account, character, report, or instance identifiers. Seven- and 90-day preview values are scaled design fixtures; live mode queries the selected period from GA4.

The dashboard currently includes:

- audience and session KPIs with previous-period comparison,
- daily traffic trend,
- server/subdomain traffic,
- normalized product route families,
- a server-by-product usage matrix,
- leaderboard statistics versus speedruns,
- privacy-safe leaderboard raid categories with classification coverage,
- acquisition and geography.

The server × product map includes a **Rest / uncategorized** column. It is the exact sum of page views whose paths do not match any named product-family rule, so each server can be reconciled without silently dropping traffic.

## Drill-down views

Use the overview for monitoring and follow its linked route families or server names into:

```text
/internal/analytics/explore?focus=reports
/internal/analytics/explore?focus=armory
/internal/analytics/explore?focus=leaderboards
/internal/analytics/explore?focus=server&host=octo.chronicleclassic.com
```

The Leaderboards view includes an instance-by-subdomain matrix. Rows are privacy-safe raid/instance categories and columns are Chronicle server hostnames; each server column includes its URL-classification coverage. The matrix is horizontally scrollable so low-volume subdomains remain available instead of being folded into Other.

The reports view explicitly separates `/instances/*`, `/instances`, `/recent`, `/logs`, `/logs/*`, and `/upload`. The armory view separates player pages under `/armory/*`, guild pages under `/g/*`, and the `/armory` search surface. Server exploration shows those same categories for one selected server.

## Preview with live GA4 data

Create `frontend/telemetry/.dev.vars` without `ANALYTICS_MOCK`:

```dotenv
GOOGLE_CLIENT_EMAIL=telemetry@example-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

The service account must have read access to GA4 property `522770959`. The property ID is a non-secret Wrangler variable in `wrangler.toml`.

## Production secrets

Set the two secrets before deploying:

```sh
npx wrangler secret put GOOGLE_CLIENT_EMAIL
npx wrangler secret put GOOGLE_PRIVATE_KEY
```

Do not configure `ANALYTICS_MOCK` in production. Cloudflare Access must cover `/internal/*`, including the analytics page and JSON API.

## Production deployment and troubleshooting

The production Worker authenticates directly to the Google Analytics Data API with a dedicated service account. This is separate from the local `analytics-mcp` setup, which uses Google Application Default Credentials.

Before deploying live analytics:

1. Add the exact `GOOGLE_CLIENT_EMAIL` service-account address as a **Viewer** under GA4 property `522770959` → **Property access management**.
2. Store `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` with `wrangler secret put`.
3. Confirm `GA4_PROPERTY_ID = "522770959"` remains in `wrangler.toml` and that `ANALYTICS_MOCK` is absent.
4. Deploy the Worker, run `npx wrangler tail`, and load `/internal/api/v1/analytics/dashboard?days=30` through Cloudflare Access.
5. Confirm the endpoint returns `mock: false`, nonzero overview metrics, the GA4 reporting timezone, and route-family totals that reconcile to overview page views.

Common live failures:

- `403 User does not have sufficient permissions for this property`: the service account has not been granted Viewer access to the GA4 property, or a different service-account address was granted.
- `400 Field dateRange is not a dimension`: standard GA4 reports cannot request `dateRange` as a dimension. Query the current and comparison periods as separate reports and combine them in the Worker.
- A successful response with missing overview data should be treated as an application error. The client validates that both overview reports contain all expected metrics instead of displaying fabricated zeros.

## Map foundry

The Access-protected map dashboard at `/internal/maps` manages manual PNG render and GLB model registrations for these R2 namespaces:

```text
forever, kronos, octowow, turtle, tbc, vanillaplus, warmane, azerothcore
```

The Worker uses the `MAPS` R2 binding configured in `wrangler.toml`. The production S3-compatible endpoint
`https://70f93c8cfa460e9932953b7fa0c9ec04.r2.cloudflarestorage.com/icons`
identifies the Cloudflare account endpoint and the `icons` bucket, so the binding uses `bucket_name = "icons"`.

Each namespace must already contain `<namespace>/maps/manifest.original.json`. The dashboard reads the existing optional layer manifests, uploads immutable assets beneath `renders/` or `3d/`, and stores private draft metadata at `<namespace>/maps/drafts/manual.json`.

Selecting a map opens a draft-aware preview workbench:

- **Original** assembles the native `manifest.original.json` floor tiles into the complete client map and provides a floor selector. Both current `original/` paths and migrated legacy `tiles/` paths are supported.
- **Rendered** switches between the manual PNG, generated render, and styled artwork when those layers exist.
- **3D model** loads the draft or published GLB in an orbit, pan, and zoom viewer powered by Google's pinned `<model-viewer>` web component.

Preview assets are streamed through Access-protected Worker routes instead of directly from the public bucket. This keeps GLB loading same-origin and avoids relying on bucket CORS settings.

Saving a draft does not change public map metadata. Publishing:

1. verifies that every draft asset exists in R2,
2. writes `manifest.renders.json` and `manifest.3d.json`,
3. writes the merged reader-facing `manifest.json` last,
4. removes the draft only after all writes succeed.

A per-namespace R2 lock and draft ETag prevent concurrent dashboard publications from overwriting each other. If publication fails before `manifest.json` is written, the draft remains available for a reconciliation retry. Public manifests keep the existing one-hour cache policy, so clients can continue to see an older complete manifest for up to one hour after publication.

Cloudflare Access must cover all `/internal/*` routes. Mutating map APIs also reject cross-site browser requests. Uploaded assets are content-addressed and intentionally retained when replaced or when a draft is discarded, matching the existing map publisher's no-delete policy.

For local preview, create or populate a local Wrangler R2 bucket with at least one namespace's original manifest, then open:

```text
http://localhost:8787/internal/maps
```

## Validation and deployment

```sh
npm run typecheck
npm run deploy
```
