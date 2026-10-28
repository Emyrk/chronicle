# Chronicle Landing Page

Static server directory at `chronicleclassic.com`. Lists all WoW private servers using Chronicle with links, attributes, and live stats.

## Development

```bash
cd frontend/landing
pnpm install
pnpm dev        # http://localhost:5173
```

The Vite dev server proxies discovery requests to the configured Chronicle deployments, so live server data works locally without requiring those deployments to allow `localhost` through CORS.

## Build

```bash
pnpm build      # → dist/
# or from repo root:
make landing
```

## Search rendering

The production build fetches every configured `/api/v1/discovery` source, renders the complete server directory into `dist/index.html`, and hydrates that markup in the browser. Crawlers therefore receive server names, descriptions, and links without needing to execute JavaScript. If discovery is temporarily unavailable during a build, the static `SERVERS` registry remains the fallback.

The build also writes `dist/sitemap.xml`; `public/robots.txt` advertises it to crawlers.

## Adding a server

1. Add an entry to `src/data/servers.ts`
2. Drop the logo into `public/servers/<id>/logo.png`
3. Optionally add a banner at `public/servers/<id>/banner.webp`

## Deployment

Deployed to GitHub Pages via `.github/workflows/deploy-landing.yml` on push to `main`.

### NitroPay and ads.txt

The landing site loads NitroPay and renders its home-page placement when a public site ID is configured:

```bash
CHRONICLE_NITROPAY_SITE_ID=12345 pnpm build
```

The deployment workflow reads the `NITROPAY_SITE_ID` GitHub Actions variable, downloads NitroPay's current managed ads.txt file, and publishes it as `https://chronicleclassic.com/ads.txt`. If the variable is unset, the build contains neither NitroPay nor ads.txt.

Official Chronicle instances can share that authorization and enable NitroPay for tenants whose **Enable Ads** toggle is on:

```bash
CHRONICLE_NITROPAY_SITE_ID=12345
CHRONICLE_ADS_TXT_URL=https://chronicleclassic.com/ads.txt
```

Chronicle returns `404 Not Found` for `/ads.txt` when the URL is unset. Self-hosted deployments therefore do not advertise Chronicle's seller account or load NitroPay by default.

### Google Analytics

The landing site always sends page views to Chronicle's GA4 property and includes `chr_src`, `chr_pos`, and `chr_cmp` when present in the URL.

Chronicle application deployments are opt-in instead. Official deployments enable the same property with:

```bash
CHRONICLE_GA_MEASUREMENT_ID=G-G0Q1B9GRC0
```

When the variable is unset, the application does not load Google Analytics. Self-hosted deployments therefore remain untracked by default.

### DNS setup

The apex `chronicleclassic.com` points to GitHub Pages (A records to GitHub's IPs):
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Active Chronicle deployment subdomains remain pointed at their hosting providers.

## Live stats

Each server card fetches `GET /api/v1/raidlogs/recent` from its Chronicle deployment to show recent activity. This is best-effort — if the request fails, the card simply omits stats. Results are cached in `sessionStorage` for 5 minutes.
