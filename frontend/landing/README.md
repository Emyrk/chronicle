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

## Adding a server

1. Add an entry to `src/data/servers.ts`
2. Drop the logo into `public/servers/<id>/logo.png`
3. Optionally add a banner at `public/servers/<id>/banner.webp`

## Deployment

Deployed to GitHub Pages via `.github/workflows/deploy-landing.yml` on push to `main`.

### ads.txt

The landing build publishes `public/ads.txt` as `https://chronicleclassic.com/ads.txt`. Advertising authorization stays scoped to the landing site and is not embedded in Chronicle application deployments.

The landing build adds AdSense account verification metadata when its public publisher ID is configured:

```bash
CHRONICLE_ADSENSE_CLIENT_ID=ca-pub-8208259743822818 pnpm build
```

The deployment workflow reads this value from the GitHub Actions repository variable named `CHRONICLE_ADSENSE_CLIENT_ID`. This metadata does not load the AdSense script or request ads; live serving remains placement-controlled.

Official Chronicle instances can share that copy by setting:

```bash
CHRONICLE_ADS_TXT_URL=https://chronicleclassic.com/ads.txt
```

Chronicle returns `404 Not Found` for `/ads.txt` when the option is unset, so self-hosted deployments do not advertise Chronicle's seller account by default.

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

Server subdomains (`turtle.chronicleclassic.com`, etc.) remain pointed at Railway.

## Live stats

Each server card fetches `GET /api/v1/raidlogs/recent` from its Chronicle deployment to show recent activity. This is best-effort — if the request fails, the card simply omits stats. Results are cached in `sessionStorage` for 5 minutes.
