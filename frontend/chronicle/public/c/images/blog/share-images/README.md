# Share-image article examples

Frozen PNGs from `services/og/app/lib/og-preview-cases.json`, rendered by the shipped
OG service at 1200 x 630. Names and numbers are illustrative fixture data, not live
records. The article and Remotion composition share these local files, so neither
needs a running OG service. Only released fixtures are included. `parse-unranked`
is the historical fixture ID for the shipped boss-kill card, not a player-parse card.

To regenerate, start `pnpm -C services/og dev --port 3108`, then request
`http://localhost:3108/api/og?<fixture params encoded as URLSearchParams>` for each
filename's fixture ID and save the PNG. Run locally without `OG_SIGNING_KEY`.
The guild example omits the optional `icon` parameter to avoid an external Discord
image dependency. No other fixture values are changed.

The 52-second silent video is embedded via the blog registry and registered as
`ShareImages` in `videos/remotion/src/Root.tsx`. From `videos/remotion`:

```sh
pnpm exec remotion still src/index.ts ShareImages out/share-images.png --frame=200
pnpm exec remotion render src/index.ts ShareImages out/share-images.mp4
```

This is a blog-only publication. Do not append `share-images` to the What's New
release list or replace its modal. The metadata also disables rotating hints.
