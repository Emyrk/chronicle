# services/og – agent guide

A standalone Next.js 16 service that renders 1200×630 Open Graph PNGs with `next/og` (Satori) on the Node.js runtime: `GET /api/og?title=…&template=…`. It deploys on its own (Docker / Railway, Root Directory `services/og`). The Go server, the frontend, the Makefile and CI neither build nor test it, and no workflow runs on its paths, so run the checks below yourself. User-facing docs live in [README.md](README.md); this file only covers how to work on the service.

## Commands

Run from `services/og`:

```bash
pnpm install          # use --frozen-lockfile in CI and Docker
pnpm dev              # http://localhost:3000, / lists every template
pnpm test             # vitest
pnpm typecheck        # tsc --noEmit
pnpm build
docker build -t chronicle-og . && docker run --rm -p 3000:3000 chronicle-og
```

Before you commit, `pnpm test && pnpm build` must pass. See [Environment variables](README.md#environment-variables) and [Parameters](README.md#parameters).

## File map

- `app/api/og/handler.tsx`: reads and caps the query, resolves `theme`/`template`, fetches images, picks the fonts, renders and sets the cache headers
- `app/api/og/themes/`: one file per template, registered in `index.ts`
- `app/api/og/themes/types.ts`: the theme contract (`ThemeProps`, `ThemeDefinition`)
- `app/api/og/themes/shared.tsx`: `loadFontsourceFamily`, `fitFontSize`, `Img`, `Cover`, `FILL`
- `app/api/og/themes/public-files.ts`: `readPublicFile` / `publicImage`, which read bundled files from disk
- `app/lib/og-themes.ts`: template keys, labels and the default (`modern`)
- `app/lib/og-remote-image.ts`: the SSRF-checked image download and DoH resolution
- `tests/themes/`: renders every registered template and checks that its fonts load from disk

## Rules

- **pnpm only.** Don't add `bun.lock`, `package-lock.json` or `yarn.lock`, and don't put the service in a root workspace.
- **Open-licence (OFL) fonts only**, as Fontsource TTFs with their `LICENSE` in `public/fonts/<id>/`. Never Zpix, never Friz Quadrata (both commercial).
- **Never fetch our own origin.** Bundled fonts and images go through `readPublicFile` / `publicImage`; behind a proxy or a Docker port mapping the server often can't reach its own public URL.
- **Every remote image goes through the SSRF pipeline** (`loadRemoteImage`). Never hand a caller's URL to Satori or `fetch` directly. See [Remote images](README.md#remote-images).
- **Cache headers are long-lived** (`s-maxage=86400, stale-while-revalidate=604800`). After a redesign, callers bust caches by adding `?v=<n>` to their URLs; the handler ignores unknown params.
- **Keep the upstream credits** (Peter Amende, bunizao) in `LICENSE` and the README's [Credits](README.md#credits).
- **Don't touch files outside `services/og`.**
- Watch for Satori layout quirks: [Satori gotchas](README.md#satori-gotchas).

## Adding a template

Follow [Adding a template](README.md#adding-a-template). `app/api/og/themes/chronicle.tsx` is the smallest complete example.
