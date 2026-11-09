# Chronicle OG image service

A standalone service that renders 1200×630 Open Graph images from a single URL:

```
GET /api/og?template=raid&guild=Nightfall&raid=Molten+Core
```

It is a Next.js 16 app that renders with `next/og` (Satori) on the Node.js runtime. It lives in the Chronicle monorepo but shares nothing with it: its own `package.json` and `pnpm-lock.yaml`, its own Dockerfile, no workspace, and nothing in the Go server, frontend, Makefile or CI depends on it.

Based on [bunizao/ogis](https://github.com/bunizao/ogis) (MIT, © Peter Amende and bunizao); see [Credits](#credits). This copy keeps the handler, the server-side image pipeline with its SSRF checks and DNS fallback, and the theme contract; upstream's generic templates are removed, and every template is a Chronicle card.

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

The Dockerfile builds Next's standalone server (`NEXT_OUTPUT=standalone`) and runs it as the `node` user on port 3000. Its repository-root build context lets it copy the shared instance configuration and loading-screen assets into the image:

```bash
docker build -t chronicle-og -f services/og/Dockerfile .
docker run --rm -p 3000:3000 -e OG_API_ONLY=true chronicle-og
curl -o hello.png 'http://localhost:3000/api/og?title=Hello&template=chronicle'
```

Production releases use the same image-backed Railway flow as `livesessiond`. Create the Railway service as `chronicle-og` from `emyrk/chronicle-og:latest`. On a Git tag, `.github/workflows/go-checks.yml` validates the renderer, pushes both `latest` and the release tag to Docker Hub, then runs `railway redeploy --service chronicle-og --yes`. The container honours Railway's `PORT`.

Put a cache in front of it. Responses carry `cache-control: public, max-age=0, s-maxage=86400, stale-while-revalidate=604800`; a CDN (Cloudflare, Bunny) or caching proxy honours that, and without one every crawler hit renders the image again.

### Outbound access

Theme fonts ship with the app and are read from disk, so the server never requests its own URL. It does reach out for:

- **Remote images** (`icon`): host names are resolved over DNS-over-HTTPS, `dns.google` first, then Cloudflare, AliDNS and DNSPod. A server that reaches none of them renders cards without remote images.
- **CJK text**: Noto Sans SC/JP/KR subsets from `fonts.googleapis.cn`, falling back to `fonts.googleapis.com`.
- **Emoji**: `next/og` fetches them from `cdn.jsdelivr.net`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen port (default `3000`) |
| `OG_API_ONLY` | `true` returns `404` for everything outside `/api/*` and `/_next/*`, i.e. hides the `/` index page |
| `OG_API_PATH` | Also serve the endpoint at `/api/<OG_API_PATH>` (one segment: letters, digits, `_`, `-`). `/api/og` always works |
| `OG_ENABLE_DEBUG` | `true` enables `/api/debug`, which takes the same query and explains why the `icon` was accepted or rejected |
| `OG_SIGNING_KEY` | HMAC key shared with the Chronicle server. When set, every request must carry a valid `sig` (see [Signed URLs](#signed-urls)); others render the fallback card. Unset accepts unsigned requests (local dev) |
| `OG_SECRET` | Legacy upstream option: keeps an `/api/og_xxxxxxxxxxxx` path derived from it working. Not needed for new deployments |

No other configuration or `.env` file is required.

## Parameters

| Param | Max length | Notes |
|-------|-----------|-------|
| `template` | | `talents`, `brand`, `character`, `guild`, `raid`, `parse` or `clear`. Missing or unknown values use `brand` |
| `theme` | | Same as `template` (upstream's name); wins if both are given |
| `accent` | | Hex colour (`#89744d` or `89744d`); invalid values use the template default. Used by `guild` |
| `icon` | | Remote logo URL, downloaded by the server (see [Remote images](#remote-images)). Used by `guild` |

Every other param belongs to a card and is listed with its template below. Card params are read with the kit's `param()`, which normalizes typographic quotes, dashes and odd Unicode spaces and caps the length.

#### Chronicle card params

Chronicle cards render from query params only: no database, no API call and no fetch to Chronicle. `api/og.go` already has the data when it serves the page, so it writes everything a card needs into the (signed) image URL. Every card takes:

| Param | Max length | Notes |
|-------|-----------|-------|
| `host` | 80 | Tenant host printed in the footer, e.g. `forever.chronicleclassic.com`. Defaults to `chronicleclassic.com` |
| `product` | 40 | Tenant flavour, e.g. `WoW Forever` |
| `art` | | Bundled raid art by slug (below). Unknown slugs draw no art; never fetched |
| `sig` | | Signature, see [Signed URLs](#signed-urls) |
| `v` | | Cache buster; ignored by the renderer but covered by `sig` |

`art` slugs are the instance name lowercased, apostrophes dropped and other runs of non-alphanumerics turned into `-` (`artSlug()` in `kit.tsx`). Available slugs come from `frontend/instance-config.json`. The Docker build copies that config and its referenced WebP loading screens into the image, so the renderer and chronicled use the same mapping and source artwork without a runtime network request.

Each card documents its own params next to its template below.

### Signed URLs

With `OG_SIGNING_KEY` set, the Chronicle server signs every image URL it writes (`ogImageURL` in `api/og.go`) and the service checks it (`app/lib/og-signature.ts`):

- **canonical**: for each param key except `sig`, sorted ascending by key, first value only, `key + "\n" + value + "\n"` with decoded values (no URL encoding), concatenated
- **sig**: the first 32 characters of the lowercase hex HMAC-SHA256 of the canonical string under the key

A missing or wrong `sig` renders the fallback card (`brand` with its defaults) with HTTP 200, never an error image, and none of the request's params are used, so no remote image is fetched. `tests/fixtures/og-sig-vectors.json` holds shared test vectors; the Go signer's test uses the same file contents, so change both together.

### Remote images

`icon` is downloaded by the server (`app/lib/og-remote-image.ts`), never by the renderer:

- `http`/`https` only, on the default port, with no credentials in the URL; `localhost`, `.local` and truncated URLs are rejected
- The host must resolve to a public IP, and the download connects to one of the addresses that were checked, so DNS rebinding can't point it elsewhere. This is re-checked on every redirect, with at most 3 redirects
- 4 second timeout, 6 MB limit
- PNG, JPEG, GIF or SVG, sniffed from the bytes. WebP and AVIF are rejected (Satori can't decode them)

An icon that fails any check is dropped and the card renders without it (the guild card draws its monogram).

## Templates

| Template | Look | Uses |
|----------|------|------|
| `talents` | Talent build for `/talents/{class}?build=`: spec + class in class colour, the point split, a bar per tree. No `points` draws "<Class> Talent Calculator" with empty trees; `class=pet` draws one bar | `class`, `spec`, `points` (`17-34-0`, one number for a pet), `keys` (up to 3, comma-separated), `host`, `product` |
| `brand` | The wordmark over a faint mark, a serif tagline, up to two count pills and the footer. Used for `/`, static routes and every fallback | `title` (default `Every pull, every parse, every wipe.`, 90), `excerpt` (default `Free raid log analysis for <product>`, 160), `stat1`/`stat2` as `count:label` (digits are grouped, or compacted from 100,000; no stats → no pill row), `host`, `product` |
| `character` | Released Armory history card for `/armory/{realm}/{player}`: an initial medallion with bundled race, class, and spec icons when recognized, plus the name, level line, guild, item level, canonical listed logs seen, and last seen. Missing icons and stats are dropped. The preserved `parse`/boss-pill performance design is not selected by Chronicle until healing versus damage spec and metric selection is settled. Cyrillic names use the bundled Inter Cyrillic cuts, CJK names a China-domain subset | Released: `name` (20), `class`, `spec`, `race`, `gender` (`male`/`female`, defaults male), `level`, `guild`, `ilvl`, `logs`, `seen`, `host`, `product`. Unreleased design: `parse` (`96.4`), `kills`, `best` (`Name:score`, up to 3) |
| `guild` | Guild page `/g/{guildId}`: logo (or a serif monogram on the accent), name, `product · N members · since Mon YYYY`, up to 4 progression bars (complete raids in gold), and the best clear. Any boss kill in a recognized progression raid selects progression. With no recognized progression kills, the activity fallback shows only estimated raid nights. Player names and aggregate scores are omitted until guild-level scoring is ready. `icon` is sent for Chronicle-hosted logos or Discord guild icons on `cdn.discordapp.com`; Discord WebP URLs are normalized to PNG | `name` (32), `members`, `since` (`YYYY-MM`), `accent` (default `#5f8fa6`), `tag`, `icon`, `prog` (`MC:10:10,…`, `short:down:total`, at most 4), `best` (seconds), `bestraid`, `raids`, `host`, `product` |
| `raid` | General raid report for `/instances/{id}` when the run does not qualify for the fast-clear card: guild and raid identity, bosses killed, duration, server-wide per-boss kill-time parse bars and their average, a right-hand panel with the top damage and top healing players, raid composition, and loading-screen art. When kill-time parses are unavailable, wipes fill the final stat slot | `guild` (40), `raid`, `date` (`YYYY-MM-DD`), `players`, `kills`, `bosses`, `dur` (seconds), `wipes`, `killparses` (comma-separated scores, at most 20), `killavg`, `top` (`name:class:dps`; Chronicle sends the top 1), `heal` (`name:class:hps`, healing plus absorbs; Chronicle sends the top 1), `comp` (`class:count`), `art`, `host`, `product` |
| `parse` | Boss share for `/s/{code}` links that select one boss kill (selected players are ignored): a gold bar, the boss, `<guild>`, raid · product, the kill time, and the fight's top damage and top healing in a right-hand panel. The preserved player-parse design (class-colour bar, name, spec · guild, DPS or HPS · kill time · `#rank / of`, and the parse ring) draws when `score` is given, but Chronicle doesn't select it. Cyrillic and CJK names load fonts as `character` does | Released: `boss` (40), `raid`, `guild`, `dur` (seconds), `top` (`name:class:dps`), `heal` (`name:class:hps`), `host`, `product`. Unreleased design: `player` (20), `class`, `spec`, `metric` (`dps`/`hps`), `value` (`1284.6`), `score`, `rank`, `of` |
| `clear` | Clear time for a qualified fast clear on `/instances/{id}` (api/og.go picks it when the server clear-time parse is 90+, else `raid`): the timer at 200px (150px for `h:mm:ss`), a gold `Realm #N` pill (no `realmrank` → `Top N%` from `score`), "Faster than N% of M clears" (`#rank of M clears` in the fallback), the green delta vs the previous realm record, `<guild>` with product · bosses · wipes · raiders, and the splits bar with labels (every other boss, counted back from the last, above 8). Cyrillic and CJK names load fonts like `character` | `guild` (32), `raid`, `ms`, `score`, `rank`, `of`, `realmrank`, `delta` (seconds, negative), `wipes`, `players`, `splits` (`Name:secs`, at most 20), `host`, `product` |

### Adding a template

1. **Fonts.** Download the Fontsource TTF cuts to `public/fonts/<id>/latin-<weight>-<style>.ttf` with the family's `LICENSE` (see `public/fonts/README.md`). Open-licence fonts only.
2. **Theme file.** Create `app/api/og/themes/<key>.tsx` exporting a `ThemeDefinition` (`themes/types.ts`):
   - `loadFonts(context)` returns the cuts, usually via `loadFontsourceFamily(id, name, variants)` from `shared.tsx`
   - `render(props, context)` returns the card as JSX. It may be `async` if it draws bundled images with `publicImage()`
   - `fontFamily`
   - read card params from `context` with the kit helpers; `props` only carries the handler's validated `accent` and downloaded `icon`. For player or guild names in Cyrillic or CJK, add `loadNameFonts(text)` to `loadFonts`
   `brand.tsx` is the smallest complete example.
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
- `<img>` needs `width`/`height` props (use `Img` from `shared.tsx`).
- Never fetch our own origin: bundled files go through `readPublicFile`/`publicImage` (`public-files.ts`), which Next's tracing ships with the standalone build.

## Credits

- Code: [OGIS](https://github.com/bunizao/ogis) by [bunizao](https://github.com/bunizao), copyright 2015–2024 Peter Amende and 2025 bunizao, under the MIT licence kept in `LICENSE`. Copied from upstream `main` at `9c57f00` without its git history.
- Chronicle mark and wordmark (`public/chronicle/`) from the Chronicle web app; raid art (`public/raids/`) is cropped from the World of Warcraft loading screens the web app already ships.
- Inter and Libre Baskerville via [Fontsource](https://fontsource.org), under the SIL Open Font License.
- Noto Sans SC, JP and KR via [Google Fonts](https://fonts.google.com/noto) for CJK text.
