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

## Validation and deployment

```sh
npm run typecheck
npm run deploy
```
