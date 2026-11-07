# Chronicle OG image service

A standalone service that renders 1200×630 Open Graph images from a single URL:

```
GET /api/og?title=Hello&template=chronicle
```

It is a Next.js 16 app that renders with `next/og` (Satori) on the Node.js runtime. It lives in the Chronicle monorepo but shares nothing with it: its own `package.json` and `pnpm-lock.yaml`, its own Dockerfile, no workspace, and nothing in the Go server, frontend, Makefile or CI depends on it.

Based on [bunizao/ogis](https://github.com/bunizao/ogis) (MIT, © Peter Amende and bunizao); see [Credits](#credits). This copy is trimmed to a starter: the handler, the server-side image pipeline with its SSRF checks and DNS fallback, the theme contract, one neutral theme (`modern`) and a `chronicle` theme.

## Local development

Node 22 and pnpm 10 (the version is pinned in `package.json`'s `packageManager`, so `corepack enable` picks it up).

```bash
cd services/og
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm build
```

Then open `http://localhost:3000/api/og?title=Hello&template=chronicle`. `/` lists every template with a live example.

## Docker

The Dockerfile builds Next's standalone server (`NEXT_OUTPUT=standalone`) and runs it as the `node` user on port 3000. The build context is this directory:

```bash
docker build -t chronicle-og services/og
docker run --rm -p 3000:3000 -e OG_API_ONLY=true chronicle-og
curl -o hello.png 'http://localhost:3000/api/og?title=Hello&template=chronicle'
```

On Railway, create a service from this repo with **Root Directory** `services/og`; it picks up the Dockerfile and honours `PORT`.

Put a cache in front of it. Responses carry `cache-control: public, max-age=0, s-maxage=86400, stale-while-revalidate=604800`; a CDN (Cloudflare, Bunny) or caching proxy honours that, and without one every crawler hit renders the image again.

### Outbound access

Theme fonts ship with the app and are read from disk, so the server never requests its own URL. It does reach out for:

- **Remote images** (`image`, `icon`, `avatar`): host names are resolved over DNS-over-HTTPS, `dns.google` first, then Cloudflare, AliDNS and DNSPod. A server that reaches none of them renders cards without remote images.
- **CJK text**: Noto Sans SC/JP/KR subsets from `fonts.googleapis.cn`, falling back to `fonts.googleapis.com`.
- **Emoji**: `next/og` fetches them from `cdn.jsdelivr.net`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen port (default `3000`) |
| `OG_API_ONLY` | `true` returns `404` for everything outside `/api/*` and `/_next/*`, i.e. hides the `/` index page |
| `OG_API_PATH` | Also serve the endpoint at `/api/<OG_API_PATH>` (one segment: letters, digits, `_`, `-`). `/api/og` always works |
| `OG_ENABLE_DEBUG` | `true` enables `/api/debug`, which takes the same query and explains why each image was accepted or rejected |
| `OG_SECRET` | Legacy upstream option: keeps an `/api/og_xxxxxxxxxxxx` path derived from it working. Not needed for new deployments |

No other configuration or `.env` file is required.

## Parameters

| Param | Max length | Notes |
|-------|-----------|-------|
| `template` | | `modern` (default) or `chronicle`. Unknown values use `modern` |
| `theme` | | Same as `template` (upstream's name); wins if both are given |
| `title` | 200 | Defaults to `Untitled` |
| `site` | 80 | Defaults to `Blog` |
| `excerpt` | 300 | Clamped to two lines |
| `author` | 80 | |
| `date` | 40 | Free text, shown as given |
| `reading` | 40 | Reading time, e.g. `5 min read` |
| `tag` | 40 | Category or kicker |
| `accent` | | Hex colour (`#89744d` or `89744d`); invalid values use the template default |
| `image` | | Cover image URL |
| `icon` | | Site icon URL |
| `avatar` | | Author avatar URL |

Typographic quotes, dashes and odd Unicode spaces are normalized before rendering.

### Remote images

`image`, `icon` and `avatar` are downloaded by the server (`app/lib/og-remote-image.ts`), never by the renderer:

- `http`/`https` only, on the default port, with no credentials in the URL; `localhost`, `.local` and truncated URLs are rejected
- The host must resolve to a public IP, and the download connects to one of the addresses that were checked, so DNS rebinding can't point it elsewhere. This is re-checked on every redirect, with at most 3 redirects
- 4 second timeout, 6 MB limit
- PNG, JPEG, GIF or SVG, sniffed from the bytes. WebP and AVIF are rejected (Satori can't decode them)

An image that fails any check is dropped and the card renders without it.

## Templates

| Template | Look | Uses |
|----------|------|------|
| `modern` | Headline set on the cover image like a magazine cover; a bundled starfield when there is no `image` | `image`, `icon`, `avatar`, `tag`, `accent` |
| `chronicle` | Chronicle's dark palette, a Libre Baskerville headline and an Inter byline under a gold rule; `image` sits behind a dark wash | `image`, `icon`, `avatar`, `tag`, `accent` (the rule and tag border) |

### Adding a template

1. **Fonts.** Download the Fontsource TTF cuts to `public/fonts/<id>/latin-<weight>-<style>.ttf` with the family's `LICENSE` (see `public/fonts/README.md`). Open-licence fonts only.
2. **Theme file.** Create `app/api/og/themes/<key>.tsx` exporting a `ThemeDefinition` (`themes/types.ts`):
   - `loadFonts(context)` returns the cuts, usually via `loadFontsourceFamily(id, name, variants)` from `shared.tsx`
   - `render(props, context)` returns the card as JSX. It may be `async` if it draws bundled images with `publicImage()`
   - `fontFamily`, and optionally `coversCjk` if the theme's own fonts draw CJK
   `chronicle.tsx` is the smallest complete example.
3. **Register it** in `app/api/og/themes/index.ts` and add a `{ key, label, description }` entry to `app/lib/og-themes.ts`. The type of `themes` makes TypeScript fail until both agree.
4. **Test.** `tests/themes/themes.test.tsx` loops over every registered theme: it checks every font cut is read from disk and renders a PNG with minimal and full props. Run `pnpm test`, then look at the result in `pnpm dev`.

### Satori gotchas

- A `div` with more than one child needs `display: flex` (or `none`/`contents`); there is no inline text flow.
- `inset` is ignored. Use explicit `top/left/width/height` (`FILL` in `shared.tsx`). Never set `top: undefined`; omit the key.
- `lineClamp` needs `display: 'block'` and a single string child. Pair it with `textWrap: 'pretty'`, not `'balance'`.
- `<img>` needs `width`/`height` props (use `Img`/`Cover` from `shared.tsx`).
- Never fetch our own origin: bundled files go through `readPublicFile`/`publicImage` (`public-files.ts`), which Next's tracing ships with the standalone build.

## Credits

- Code: [OGIS](https://github.com/bunizao/ogis) by [bunizao](https://github.com/bunizao), copyright 2015–2024 Peter Amende and 2025 bunizao, under the MIT licence kept in `LICENSE`. Copied from upstream `main` at `9c57f00` without its git history.
- Default background (`public/default-bg.jpg`): [Cluster of Stars](https://unsplash.com/photos/cluster-of-stars-in-the-sky-qVotvbsuM_c) by [Paul Lichtblau](https://unsplash.com/@paullichtblau) on Unsplash.
- Geist, Inter and Libre Baskerville via [Fontsource](https://fontsource.org), under the SIL Open Font License.
- Noto Sans SC, JP and KR via [Google Fonts](https://fonts.google.com/noto) for CJK text.
