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
