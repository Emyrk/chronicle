---
name: og-images
description: Maintains Chronicle Open Graph metadata, signed image URLs, and the Next.js image renderer. Use when changing serviceog, OG card selection or design, preview galleries, renderer caching, Prometheus metrics, Docker builds, or tagged Railway releases.
---

# OG images

## Boundaries and entry points

- `internal/services/serviceog` owns metadata resolution, card selection, signing, and renderer lookups. `api` owns route wiring. Read the root AGENTS.md Open Graph section before changing selection behavior.
- `services/og/app/api/og/handler.tsx` verifies signed parameters, loads fonts/images, and returns a lazy `ImageResponse`. `/api/og` and configured aliases share it.
- `services/og/app/api/og/themes/` contains templates; `app/lib/og-themes.ts` normalizes names to bounded canonical keys.
- Read `services/og/AGENTS.md` and the relevant README sections before renderer work. Keep its pnpm package independent of the frontend.

## Preserve shipped behavior

- With no renderer URL or signing key, Go keeps static metadata and skips generated-card lookups.
- Armory selects history only, not the retained performance design. Boss shares ignore selected players and show kill time plus top DPS/HPS; retained player-parse designs are preview-only.
- Raid report parses are server-wide per-boss kill-time parses and their average, not player-average parses.
- Guild cards omit player lists and aggregate player scores; activity fallback estimates raid nights. Follow serviceog's Chronicle-hosted or exact Discord guild-icon policy and WebP-to-PNG normalization.
- Never display or serialize server/realm names in cards or metadata. Navigation URLs may carry realm IDs.
- Keep Go `og_image_url.go` and TypeScript `app/lib/og-signature.ts` byte-compatible. For signature changes, update shared vectors and both test suites together. Never use the signing key as the metrics bearer token.

## Render and inspect

1. Start `pnpm dev` from `services/og` without a signing key for the curated approval gallery at `/`.
2. Update `app/lib/og-preview-cases.json` when adding a supported visual variant. Run `pnpm preview:links` to generate self-contained `.preview/index.html`.
3. Run `pnpm preview:links -- <real-Chronicle-url...>` before/after metadata changes. This fetches real crawler metadata and its selected image, rather than guessing from renderer fixtures. Local end-to-end previews need matching Go/renderer signing keys.
4. Inspect actual PNGs. Read README's Satori gotchas: use explicit flex layout; do not assume browser CSS support. Bundled fonts/art use disk helpers, never self-origin fetches. Remote images must pass `loadRemoteImage` SSRF checks.

## Caching and observability

- Preserve `s-maxage=86400, stale-while-revalidate=604800`. A redesign needs a caller cache-buster (`v`) included before signing. Do not assume origin metrics include CDN hits.
- `app/lib/og-metrics.ts` owns process-global collectors shared by separately bundled instrumentation and route code. `instrumentation.ts` starts the opt-in private listener; never add `/api/metrics` on Next's public port.
- Keep labels bounded to canonical theme/outcome, with no names, URLs, signatures, or identifiers. Track preparation and lazy body completion separately; errors/cancellation must decrement in-flight exactly once.
- Read README's Private Prometheus metrics section before deployment changes. The default port is 9091, loopback by default, with a required independent bearer token. Use private networking for scrapes, never a public Railway domain for this port.

## Validation and release

From `services/og`, run `pnpm test`, `pnpm typecheck`, and `pnpm build`. For Go changes run `go test ./internal/services/serviceog` from the repo root (database-backed tests need project test Postgres). Run signature suites on both sides when changing the signed contract.

From the root, run `docker build -t chronicle-og services/og` then `services/og/scripts/smoke-container.sh chronicle-og`. The smoke checks disabled/enabled metrics, auth, no public endpoint, a real PNG, and exact scrape counters/bytes. This catches split-bundle registries that unit tests alone cannot prove.

Root `.github/workflows/go-checks.yml` validates the service and builds the image. Tags push `emyrk/chronicle-og` and redeploy Railway `chronicle-og`. Run actionlint when changing workflow YAML. Do not change deployed settings or trigger a release without user approval.
