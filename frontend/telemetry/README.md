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

The Access-protected map dashboard at `/internal/maps` manages manual PNG or WebP render and calibrated GLB mesh registrations for these R2 namespaces:

```text
forever, kronos, epoch, turtle, tbc, vanillaplus, warmane, ascension, azerothcore
```

OctoWoW and Capy reuse the `turtle` icon CDN namespace and are managed through the Turtle entry; they do not have separate R2 prefixes.

The Worker uses the `MAPS` R2 binding configured in `wrangler.toml`. The production S3-compatible endpoint
`https://70f93c8cfa460e9932953b7fa0c9ec04.r2.cloudflarestorage.com/icons`
identifies the Cloudflare account endpoint and the `icons` bucket, so the binding uses `bucket_name = "icons"`.

The dashboard prefers `<namespace>/maps/manifest.original.json`. For legacy namespaces that only have the older reader-facing `manifest.json`, it recovers the native map inventory and any embedded optional artwork before editing. A namespace with neither manifest starts from an empty product-specific v2 base, so operators can add named map IDs and publish manual renders or meshes. The first publish writes a reusable `manifest.original.json` bootstrap before the layer manifests and merged reader manifest. Native extraction can replace that empty bootstrap later without changing manual layer ownership.

The dashboard uploads immutable assets beneath `renders/` or `3d/`, and stores private draft metadata at `<namespace>/maps/drafts/manual.json`.

Selecting a map opens a draft-aware preview workbench:

- **Original** assembles native floor tiles (including published legacy `tiles/` paths) with a floor selector.
- **Rendered** switches between draft or published manual PNG/WebP and styled artwork.
- **3D model** loads draft or published GLBs in an orbit, pan and zoom viewer.

Preview assets stream through Access-protected Worker routes rather than directly from the public bucket. Mesh entries require explicit calibrated XY bounds, zMin/zMax and the `wow-yup-mirrored-x` frame; uploading a GLB does not infer coordinates. Saving a draft does not change public metadata. Publishing:

1. verifies that every draft asset exists in R2,
2. writes `manifest.renders.json` and `manifest.meshes.json`,
3. writes the merged reader-facing `manifest.json` last,
4. removes the draft only after all writes succeed.

A per-namespace R2 lock and draft ETag prevent concurrent dashboard publications from overwriting each other. If publication fails before `manifest.json` is written, the draft remains available for a reconciliation retry. Public manifests keep the existing one-hour cache policy, so clients can continue to see an older complete manifest for up to one hour after publication.

Cloudflare Access must cover all `/internal/*` routes. Mutating map APIs also reject cross-site browser requests. Uploaded assets are content-addressed and intentionally retained when replaced or when a draft is discarded, matching the existing map publisher's no-delete policy.

For local preview, start the Worker with a local Wrangler R2 bucket. Namespaces may contain an original manifest, a legacy reader manifest, or no manifest yet:

```text
http://localhost:8787/internal/maps
```

## Miniature foundry

The Access-protected dashboard at `/internal/miniatures` manages reusable creature-token GLBs shared by every Chronicle server. It stores assets and metadata at the root of the `icons` bucket:

```text
miniatures/manifest.json
miniatures/<content-digest>-<name>.glb
```

The public manifest contract is:

```json
{
  "format": "chronicle-unit-miniatures-v1",
  "miniatures": [{
    "name": "Deviate serpent",
    "path": "miniatures/deviate-serpent.glb",
    "entry_ids": [3669, 3670, 3671, 3673]
  }]
}
```

One model may own many positive creature entry IDs, but each entry ID may appear in only one model. Paths are unique, clean `miniatures/*.glb` paths. The editor validates GLB 2.0 uploads, previews models interactively, detects duplicate assignments, and supports the same R2 draft, ETag, lock, explicit publish, and one-hour public-manifest cache workflow as the Map Foundry.

The Chronicle replay Map panel fetches this root-level manifest once per cached frontend session and resolves models by creature entry ID for hostiles, pets, totems, and other units. Published models take priority; the bundled Wailing Caverns boss models and ordinary unit markers remain fallbacks when the manifest, an entry, or a GLB is unavailable.

## Validation and deployment

```sh
npm run typecheck
npm run deploy
```
