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

Then open `http://localhost:3000/`. The index is the approval gallery: every curated card variant, grouped by product surface and labelled with the Chronicle route that selects it. It uses the real `next/og` endpoint, fonts, and bundled assets rather than approximating the cards as frontend components in Storybook.

## Preview and approve cards

With the local renderer running **without** `OG_SIGNING_KEY`, capture every curated variant into one self-contained HTML file:

```bash
cd services/og
pnpm preview:links
```

The command renders every case from `app/lib/og-preview-cases.json`, embeds the resulting PNGs, and writes `.preview/index.html`. The file can be opened or shared without keeping the renderer running. Use `--renderer http://localhost:3001` or `--out /tmp/og-preview.html` to override the defaults.

To check what Discord will see for specific real Chronicle pages, pass their URLs instead:

```bash
pnpm preview:links -- \
  'https://chronicleclassic.com/instances/example' \
  'https://chronicleclassic.com/s/example' \
  'https://chronicleclassic.com/armory/turtle/player'
```

In URL mode, the command fetches each page with a Discord crawler user agent and previews its actual `og:title`, `og:description`, `og:url`, and `og:image`.

For local end-to-end page testing, run Chronicle with `CHRONICLE_OG_SERVICE_URL` pointing at the local OG service and set the same development key in `CHRONICLE_OG_SIGNING_KEY` and the renderer's `OG_SIGNING_KEY`, then pass the local Chronicle page URLs to URL mode. The curated approval gallery intentionally uses an unsigned renderer so its hand-authored cases can render directly.

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
| `OG_SIGNING_KEY` | HMAC key shared with the Chronicle server. When set, every request must carry a valid `sig` (see [Signed URLs](#signed-urls)); others render the fallback card. Unset accepts unsigned requests (local dev) |
| `OG_SECRET` | Legacy upstream option: keeps an `/api/og_xxxxxxxxxxxx` path derived from it working. Not needed for new deployments |

No other configuration or `.env` file is required.

## Parameters

| Param | Max length | Notes |
|-------|-----------|-------|
| `template` | | `modern` (default), `chronicle`, `talents`, `brand`, `character` or `guild`. Unknown values use `modern` |
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

#### Chronicle card params

Chronicle cards render from query params only: no database, no API call and no fetch to Chronicle. `api/og.go` already has the data when it serves the page, so it writes everything a card needs into the (signed) image URL. Every card takes:

| Param | Max length | Notes |
|-------|-----------|-------|
| `host` | 80 | Tenant host printed in the footer, e.g. `forever.chronicleclassic.com`. Defaults to `chronicleclassic.com` |
| `product` | 40 | Tenant flavour, e.g. `WoW Forever` |
| `art` | | Bundled raid art by slug (below). Unknown slugs draw no art; never fetched |
| `sig` | | Signature, see [Signed URLs](#signed-urls) |
| `v` | | Cache buster; ignored by the renderer but covered by `sig` |

`art` slugs are the instance name lowercased, apostrophes dropped and other runs of non-alphanumerics turned into `-` (`artSlug()` in `kit.tsx`): `molten-core`, `blackwing-lair`, `zulgurub`, `ruins-of-ahnqiraj`, `temple-of-ahnqiraj`, `naxxramas`, `onyxias-lair`, `emerald-sanctum`, `tower-of-karazhan`, `lower-tower-of-karazhan`, `upper-tower-of-karazhan`. The JPGs in `public/raids/` are the same 3:2 centre crops of the web app's loading screens that `frontend.InstanceOGImage` serves.

Each card documents its own params next to its template below.

### Signed URLs

With `OG_SIGNING_KEY` set, the Chronicle server signs every image URL it writes (`ogImageURL` in `api/og.go`) and the service checks it (`app/lib/og-signature.ts`):

- **canonical**: for each param key except `sig`, sorted ascending by key, first value only, `key + "\n" + value + "\n"` with decoded values (no URL encoding), concatenated
- **sig**: the first 32 characters of the lowercase hex HMAC-SHA256 of the canonical string under the key

A missing or wrong `sig` renders the fallback card (`brand` with its defaults) with HTTP 200, never an error image, and none of the request's params are used, so no remote image is fetched. `tests/fixtures/og-sig-vectors.json` holds shared test vectors; the Go signer's test uses the same file contents, so change both together.

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
| `talents` | Talent build for `/talents/{class}?build=`: spec + class in class colour, the point split, a bar per tree. No `points` draws "<Class> Talent Calculator" with empty trees; `class=pet` draws one bar | `class`, `spec`, `points` (`17-34-0`, one number for a pet), `keys` (up to 3, comma-separated), `host`, `product` |
| `brand` | The wordmark over a faint mark, a serif tagline, up to two count pills and the footer. Used for `/`, static routes and every fallback | `title` (default `Every pull, every parse, every wipe.`, 90), `excerpt` (default `Free raid log analysis for <product>`, 160), `stat1`/`stat2` as `count:label` (digits are grouped, or compacted from 100,000; no stats → no pill row), `host`, `product` |
| `character` | Released Armory history card for `/armory/{realm}/{player}`: an initial medallion in class colour with the current talent spec, name, level line, guild · realm, item level, canonical listed logs seen, and last seen. Missing stats are dropped. The preserved `parse`/boss-pill performance design is not selected by Chronicle until healing versus damage spec and metric selection is settled. Cyrillic names use the bundled Inter Cyrillic cuts, CJK names a China-domain subset | Released: `name` (20), `class`, `spec`, `race`, `level`, `guild`, `realm`, `ilvl`, `logs`, `seen`, `host`, `product`. Unreleased design: `parse` (`96.4`), `kills`, `best` (`Name:score`, up to 3) |
| `guild` | Guild page `/g/{guildId}`: logo (or a serif monogram on the accent), name, `realm · product · N members · since Mon YYYY`, up to 4 progression bars (complete raids in gold), best clear and top parse average. Any boss kill in a recognized progression raid selects progression. With no recognized progression kills, the activity fallback draws estimated raid nights over the `top` 3 parsers. `icon` is only sent for Chronicle-hosted logos | `name` (32), `realm`, `members`, `since` (`YYYY-MM`), `accent` (default `#5f8fa6`), `tag`, `icon`, `prog` (`MC:10:10,…`, `short:down:total`, at most 4), `best` (seconds), `bestraid`, `avg`, `raids`, `top` (`name:class:score`, at most 3), `host`, `product` |
| `parse` | One player on one boss kill, for `/s/{code}` shares: a class-colour bar, the name (96 → 80 → 64 px), spec · guild, the boss in gold, then DPS (or HPS for `metric=hps`) · kill time · `#rank / of`, with the parse ring (SVG, tier colour from `score`) on the right. Without `score` (no parse, or below 75) DPS / HPS leads on the right with `#N in raid`. Unknown class → grey. Cyrillic and CJK names load fonts as `character` does | `player` (20), `class`, `spec`, `boss`, `raid`, `guild`, `realm`, `metric` (`dps`/`hps`), `value` (`1284.6`), `dur` (seconds), `score`, `rank`, `of`, `raidrank`, `host`, `product` |
| `clear` | Clear time for a qualified fast clear on `/instances/{id}` (api/og.go picks it when the server clear-time parse is 90+, else `raid`): the timer at 200px (150px for `h:mm:ss`), a gold pill `#N on <realm>` (no `realmrank` → `Top N%` from `score`), "Faster than N% of M clears" (`#rank of M clears` in the fallback), the green delta vs the previous realm record, `<guild>` with product · bosses · wipes · raiders, and the splits bar with labels (every other boss, counted back from the last, above 8). Cyrillic and CJK names load fonts like `character` | `guild` (32), `raid`, `realm`, `ms`, `score`, `rank`, `of`, `realmrank`, `delta` (seconds, negative), `wipes`, `players`, `splits` (`Name:secs`, at most 20), `host`, `product` |

### Adding a template

1. **Fonts.** Download the Fontsource TTF cuts to `public/fonts/<id>/latin-<weight>-<style>.ttf` with the family's `LICENSE` (see `public/fonts/README.md`). Open-licence fonts only.
2. **Theme file.** Create `app/api/og/themes/<key>.tsx` exporting a `ThemeDefinition` (`themes/types.ts`):
   - `loadFonts(context)` returns the cuts, usually via `loadFontsourceFamily(id, name, variants)` from `shared.tsx`
   - `render(props, context)` returns the card as JSX. It may be `async` if it draws bundled images with `publicImage()`
   - `fontFamily`, and optionally `coversCjk` if the theme's own fonts draw CJK
   `chronicle.tsx` is the smallest complete example.
3. **Register it** in `app/api/og/themes/index.ts` and add a `{ key, label, description }` entry to `app/lib/og-themes.ts`. The type of `themes` makes TypeScript fail until both agree.
   For a Chronicle card, build on the kit in `app/api/og/themes/kit.tsx` so the card file is only its layout:
   - params: `param(context, key, max)`, `intParam(context, key, { min, max })`, `listParam(context, key, { maxItems, maxLength })` (split `a:b:c` items yourself), `chromeParams(context)` for `host`/`product`
   - chrome: `<Header markSrc chip />` (mark, `CHRONICLE` kicker, right chip) and `<Footer host cta />`; `markImage()` / `wordmarkImage()` load the logos, `loadKitFonts()` the Inter + Libre Baskerville cuts
   - tables: `COLORS`, `SANS`/`SERIF`, `classColor(name)` (unknown → grey), `parseColor(score)` (same tiers as the web app), `formatDuration(seconds)` (`h:mm:ss` / `m:ss`)
   - art: `artImage(context)` returns the bundled `art=<slug>` JPEG as a data URL, or null
   Draw arrows and other symbols as SVG: the bundled latin font cuts lack them (no `→`), and a missing glyph makes `next/og` fetch a font.
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
- Chronicle mark and wordmark (`public/chronicle/`) from the Chronicle web app; raid art (`public/raids/`) is cropped from the World of Warcraft loading screens the web app already ships.
- Geist, Inter and Libre Baskerville via [Fontsource](https://fontsource.org), under the SIL Open Font License.
- Noto Sans SC, JP and KR via [Google Fonts](https://fonts.google.com/noto) for CJK text.
